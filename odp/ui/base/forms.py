import json
import re
from datetime import datetime

from flask import Flask, session
from wtforms import BooleanField, DateField, FloatField, Form, SelectField, SelectMultipleField, StringField, \
    TextAreaField, ValidationError, FormField, FieldList, FileField
from wtforms.csrf.session import SessionCSRF
from wtforms.validators import optional, email, input_required, data_required
from wtforms.widgets import CheckboxInput, ListWidget


def init_app(app: Flask):
    BaseForm.Meta.csrf_secret = bytes(app.config['SECRET_KEY'], 'utf-8')


class BaseForm(Form):
    class Meta:
        csrf = True
        csrf_class = SessionCSRF

        @property
        def csrf_context(self):
            return session


class MultiCheckboxField(SelectMultipleField):
    widget = ListWidget(prefix_label=False)
    option_widget = CheckboxInput()


class MapField(StringField):
    def process_data(self, value):
        self.data = None


class StringListField(TextAreaField):
    def process_data(self, value):
        self.data = '\n'.join(value) if value is not None else None


class DateStringField(DateField):
    def process_data(self, value):
        self.data = datetime.strptime(value, '%Y-%m-%d') if value is not None else None


class SubmissionDateField(DateField):
    def process_formdata(self, valuelist):
        if valuelist:
            self.data = datetime.strptime(valuelist[0], '%Y-%m-%d').date()

    def process_data(self, value):
        self.data = datetime.strptime(value, '%Y-%m-%d').date() if value is not None else None


class JSONTextField(TextAreaField):
    def process_data(self, value):
        self.data = json.dumps(value, indent=4, ensure_ascii=False)


def json_object(form, field):
    """A JSONTextField validator that ensures the value is a JSON object."""
    try:
        obj = json.loads(field.data)
        if not isinstance(obj, dict):
            raise ValidationError('The value must be a JSON object.')
    except json.JSONDecodeError:
        raise ValidationError('Invalid JSON')


class SearchForm(BaseForm):
    q = StringField(filters=[lambda s: s.strip() if s else s])
    n = FloatField()
    e = FloatField()
    s = FloatField()
    w = FloatField()
    after = DateStringField(validators=[optional()], label='Start date')
    before = DateStringField(validators=[optional()], label='End date')
    exclusive_region = BooleanField(label='Exclusive region')
    exclusive_interval = BooleanField(label='Exclusive interval')
    sort = SelectField(choices=[
        ('rank desc', 'Relevance'),
        ('timestamp desc', 'Last updated'),
    ])

    @classmethod
    def add_facets(cls, *facets: str) -> None:
        """Add facet fields to the search form."""
        for facet in facets:
            setattr(cls, cls.facet_fieldname(facet), StringField())

    @staticmethod
    def facet_fieldname(facet: str) -> str:
        return 'facet_' + re.sub(r'\W', '_', facet).lower()

class DownloadAuditForm(BaseForm):
    name = StringField(
        label='Name',
        validators=[input_required()],
    )
    email = StringField(
        label='Email',
        validators=[input_required(), email()],
    )
    organisation = StringField(
        label='Organisation',
        validators=[input_required()],
    )
    disclaimer_acknowledgment = BooleanField(
        label='Data Usage Acknowledgment',
        validators=[input_required()],
        description=(
            "These data are made available with the express understanding that any such use "
            "will properly acknowledge the originator(s) and publisher and cite the accession "
            "numbers and/or associated Digital Object Identifiers. Anyone wishing to use these "
            "data should properly cite and attribute the data providers listed as authors in "
            "the metadata provided with each dataset. It is expected that all the conditions "
            "of the data license will be strictly honoured. Use of any material herein should "
            "be properly cited using the dataset's persistent identifiers, such as accession "
            "numbers and DOIs."
        ),
    )

class CreatorForm(BaseForm):
    orcid = StringField(label='ORCID')
    first_name = StringField(label='First Name')
    last_name = StringField(label='Last Name')
    affiliation_name = StringField(label='Affiliation', validators=[data_required()])


class FundingReferencesForm(BaseForm):
    funder_name = StringField(label='Funder name')
    funder_identifier = StringField(label='Funder identifier')
    funder_identifier_type = SelectField(
        label='Funder identifier type',
        choices=[
            "",
            "ISNI",
            "GRID",
            "Crossref Funder ID",
            "ROR",
            "Other"
        ],
        default="ISNI"
    )
    award_number = StringField(label='Award number')
    award_title = StringField(label='Award title')


class ContributorForm(CreatorForm):
    contributor_type = SelectField(label='Contributor type', choices=[
        ('ContactPerson', 'Contact Person'),
        ('DataCollector', 'Data Collector'),
        ('DataCurator', 'Data Curator'),
        ('DataManager', 'Data Manager'),
        ('Distributor', 'Distributor'),
        ('Editor', 'Editor'),
        ('HostingInstitution', 'Hosting Institution'),
        ('Producer', 'Producer'),
        ('ProjectLeader', 'Project Leader'),
        ('ProjectManager', 'Project Manager'),
        ('ProjectMember', 'Project Member'),
        ('RegistrationAgency', 'Registration Agency'),
        ('RegistrationAuthority', 'Registration Authority'),
        ('RelatedPerson', 'Related Person'),
        ('Researcher', 'Researcher'),
        ('ResearchGroup', 'Research Group'),
        ('RightsHolder', 'Rights Holder'),
        ('Sponsor', 'Sponsor'),
        ('Supervisor', 'Supervisor'),
        ('WorkPackageLeader', 'Work Package Leader'),
        ('Other', 'Other')
    ])
    email = StringField(label='Email')

    def validate_email(self, field):
        if self.contributor_type.data == 'ContactPerson':
            if not field.data or not field.data.strip():
                raise ValidationError("Email is required when 'Contact Person' is selected.")


class GeographicExtentForm(BaseForm):
    map = MapField(label="", description='Draw a bounding box OR specify a point.')
    east_bound_longitude = FloatField(label='East Bound Longitude', validators=[optional()])
    north_bound_latitude = FloatField(label='North Bound Latitude', validators=[optional()])
    south_bound_latitude = FloatField(label='South Bound Latitude', validators=[optional()])
    west_bound_longitude = FloatField(label='West Bound Longitude', validators=[optional()])
    point_latitude = FloatField(label='Point Latitude', validators=[optional()])
    point_longitude = FloatField(label='Point Longitude', validators=[optional()])


class LicenseForm(BaseForm):
    license = SelectField(label='License', choices=[
        ('https://creativecommons.org/licenses/by/4.0/', 'Attribution 4.0 International (CC BY 4.0)'),
        ('https://creativecommons.org/licenses/by-sa/4.0/', 'Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)'),
        ('Embargo', 'Embargo'),
        ('Other', 'Other')
    ],
     description="Conditions under which the dataset should be shared. Read more about Creative Commons licenses <a href='https://creativecommons.org/chooser/'>here</a>."
     )
    embargo_reason = StringField(label='Embargo Reason')
    other_text = StringField(label='Please Specify')

    def validate_embargo_reason(self, field):
        if self.license.data == 'Embargo' and not field.data.strip():
            raise ValidationError('An embargo reason is required when the "Embargo" license is selected.')

    def validate_other_text(self, field):
        if self.license.data == 'Other' and not field.data.strip():
            raise ValidationError('Please specify')


class DateRangeForm(BaseForm):
    start_date = SubmissionDateField(label='Start date', validators=[data_required()])
    end_date = SubmissionDateField(label='End date', validators=[data_required()])


class RelatedIdentifiersForm(BaseForm):
    related_identifier = StringField(label='Related resource')
    relationship_type = SelectField(
        label='Relationship type',
        choices=[
            ('', '-- Select --'),
            ('IsCitedBy', 'Is Cited By'),
            ('Cites', 'Cites'),
            ('IsSupplementTo', 'Is Supplement To'),
            ('IsSupplementedBy', 'Is Supplemented By'),
            ('IsContinuedBy', 'Is Continued By'),
            ('Continues', 'Continues'),
            ('IsDescribedBy', 'Is Described By'),
            ('Describes', 'Describes'),
            ('HasMetadata', 'Has Metadata'),
            ('IsMetadataFor', 'Is Metadata For'),
            ('HasVersion', 'Has Version'),
            ('IsVersionOf', 'Is Version Of'),
            ('IsNewVersionOf', 'Is New Version Of'),
            ('IsPreviousVersionOf', 'Is Previous Version Of'),
            ('IsPartOf', 'Is Part Of'),
            ('HasPart', 'Has Part'),
            ('IsPublishedIn', 'Is Published In'),
            ('IsReferencedBy', 'Is Referenced By'),
            ('References', 'References'),
            ('IsDocumentedBy', 'Is Documented By'),
            ('Documents', 'Documents'),
            ('IsCompiledBy', 'Is Compiled By'),
            ('Compiles', 'Compiles'),
            ('IsVariantFormOf', 'Is Variant Form Of'),
            ('IsOriginalFormOf', 'Is Original Form Of'),
            ('IsIdenticalTo', 'Is Identical To'),
            ('IsReviewedBy', 'Is Reviewed By'),
            ('Reviews', 'Reviews'),
            ('IsDerivedFrom', 'Is Derived From'),
            ('IsSourceOf', 'Is Source Of'),
            ('IsRequiredBy', 'Is Required By'),
            ('Requires', 'Requires'),
            ('IsObsoletedBy', 'Is Obsoleted By'),
            ('Obsoletes', 'Obsoletes'),
        ]
    )


class VerticalExtentForm(BaseForm):
    height = StringField(label='Maximum')
    depth = StringField(label='Minimum')
    measurement = StringField(label='Measurement')


class SubmissionForm(BaseForm):
    title = StringField(label='Title', description='Dataset title.', validators=[data_required()])
    abstract = TextAreaField(
        label='Dataset Abstract',
        description='Description of the dataset. The Abstract should include enough detail to fully explain the context of the dataset.',
        validators=[data_required()]
    )
    methods = TextAreaField(
        label='Methodology',
        description='Detailed provenance on how the dataset was produced including methods applied.'
    )
    instruments = SelectMultipleField(
        label='Instruments',
        description='Type in the instrument used, if applicable, and it will provide a list of available keywords.')
    keywords = SelectMultipleField(
        label='Keywords',
        description='Select applicable keywords from a fixed vocabulary of earth science topics. Start typing to see the available list.',
        validators=[data_required()])
    creators = FieldList(
        FormField(CreatorForm),
        label='Creators',
        min_entries=1,
        description='The main researchers or organisations involved in producing the data. Tip: If you fill in your ORCID ID the subsequent fields will auto-populate.'
    )
    contributors = FieldList(
        FormField(ContributorForm),
        label='Contributors',
        min_entries=1,
        description='Other parties who contributed to the data, including a contact person. Tip: If you fill in your ORCID ID the subsequent fields will auto-populate.'
    )
    geographic_extent = FormField(GeographicExtentForm, label='Geographic Extent')
    location_name = StringField(
        label='Geographic location',
        description='Name of the place covered by the dataset.'
    )
    spatial_resolution = StringField(
        label='Spatial Resolution',
        description='Provide the spatial resolution for the dataset - this is only applicable to grid or imagery data.'
    )
    reference_system = StringField(
        label='Reference System',
        description='Provide the spatial or coordinate reference system used in the data submission - this is only applicable to projection data, eg WGS84.'
    )
    vertical_extent = FormField(
        VerticalExtentForm,
        label='Vertical Extent',
        description='Altitude and depth of the features described in the data submission, as well as measurement used, eg. Mean Sea Level.'
    )
    date_range = FormField(
        DateRangeForm,
        label='Temporal coverage dates',
        description="Time period covered by the content of the dataset. Use today's date if you are unsure of the time period covered."
    )
    project = FieldList(
        StringField(),
        label='Project',
        min_entries=1,
        description='Project or collection that this dataset falls under, if applicable.'
    )
    related_identifiers = FieldList(
        FormField(RelatedIdentifiersForm),
        label='Related Resources',
        min_entries=1,
        description='Include links or DOIs for related resources and choose the relationship type.'
    )
    funding_reference = FieldList(FormField(FundingReferencesForm), min_entries=1, label='Funding References')
    license = FormField(
        LicenseForm,
        label='License'
    )


class SubmissionDataUploadForm(BaseForm):
    dataset_link = StringField('Dataset Link')
    dataset = FileField('Dataset File')

    def validate(self, extra_validators=None):
        initial_valid = super(SubmissionDataUploadForm, self).validate(extra_validators=extra_validators)
        if not initial_valid:
            return False

        has_link = bool(self.dataset_link.data and self.dataset_link.data.strip())

        has_file = bool(self.dataset.data)
        if has_file and hasattr(self.dataset.data, 'filename'):
            has_file = bool(self.dataset.data.filename)

        if has_link and has_file:
            message = "Please provide either a link OR a file, not both."
            self.dataset_link.errors.append(message)
            self.dataset.errors.append(message)
            return False

        if not has_link and not has_file:
            message = "You must provide either a dataset link or upload a file."
            self.dataset_link.errors.append(message)
            return False

        return True
