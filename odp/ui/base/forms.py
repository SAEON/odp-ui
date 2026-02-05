import json
import re
from datetime import datetime

from flask import Flask, session
from wtforms import BooleanField, DateField, FloatField, Form, SelectField, SelectMultipleField, StringField, \
    TextAreaField, ValidationError, FormField, FieldList, FileField, Field
from wtforms.csrf.session import SessionCSRF
from wtforms.validators import optional, data_required
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


class CreatorForm(BaseForm):
    orcid = StringField(label='ORCID')
    first_name = StringField(label='First Name', validators=[data_required()])
    last_name = StringField(label='Last Name', validators=[data_required()])
    affiliation = StringField(label='Affiliation')


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
        ('WorkPackageLeader', 'Work Package Leader')
    ])
    email = StringField(label='Email')

    def validate(self, extra_validators=None):
        """
        Validation to check if email is present when 'ContactPerson' is selected.
        """
        if not super().validate(extra_validators):
            return False

        if self.contributor_type.data == 'ContactPerson':
            if not self.email.data or not self.email.data.strip():
                msg = "Email is required when 'Contact Person' is selected."
                self.email.errors.append(msg)
                return False

        return True


class GeoLocationBoxForm(BaseForm):
    map = MapField(label='Draw bounding box')
    east_bound_longitude = FloatField(label='East Bound Longitude', validators=[data_required()])
    north_bound_latitude = FloatField(label='North Bound Latitude', validators=[data_required()])
    south_bound_latitude = FloatField(label='South Bound Latitude', validators=[data_required()])
    west_bound_longitude = FloatField(label='West Bound Longitude', validators=[data_required()])


class LicenseForm(BaseForm):
    license = SelectField(label='License', choices=[
        'Attribution - ShareAlike 4.0 International(CC BY - SA 4.0)',
        'Embargo'
    ])
    embargo_reason = StringField(label='Embargo Reason')


class DateRangeForm(BaseForm):
    start_date = DateStringField(label='Start date')
    end_date = DateStringField(label='End date')


class RelatedIdentifiersForm(BaseForm):
    related_identifier = StringField(label='Related Identifier')
    relationship_type = SelectField(
        label='Relationship type',
        choices=[
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
    height = StringField(label='Height')
    depth = StringField(label='Depth')
    measurement = StringField(label='Measurement')


class SubmissionForm(BaseForm):
    title = StringField(label='Title', description='Title of the data submission')
    abstract = TextAreaField(label='Description: Abstract', description='Description of the data submission')
    methods = TextAreaField(label='Description: Methods',
                            description='Detailed provenance on how the dataset was generated including methods applied')
    instruments = SelectMultipleField(label='Instruments')
    keywords = SelectMultipleField(label='Keywords')
    creators = FieldList(FormField(CreatorForm), label='Creators', min_entries=1,
                         description='The main researchers or organisations involved in producing the data submission')
    contributors = FieldList(
        FormField(ContributorForm),
        label='Contributors',
        min_entries=1,
        description='Other parties who contributed to the resource, including a contact person'
    )
    licence = FormField(
        LicenseForm,
        label='Licence',
        description='Conditions under which the data submission should be shared'
    )
    date_range = FormField(
        DateRangeForm,
        label='Date Range',
        description='Time period covered by the content of the dataset'
    )
    location = StringField(
        label='Geographic location',
        description='Name of the geographic area covered by the dataset'
    )
    project = FieldList(
        StringField(),
        label='Project',
        min_entries=1,
        description='Project or collection that this dataset falls under'
    )
    related_identifiers = FieldList(
        FormField(
            RelatedIdentifiersForm,
            label='Related Identifiers'
        ),
        min_entries=1,
        description='Links for related resources'
    )
    spatial_resolution = StringField(
        label='Spatial Resolution',
        description='Level of detail expressed as a scale factor or ground distance this is only applicable to grid or imagery data'
    )
    reference_system = StringField(
        label='Reference System',
        description='EPSG code of spatial and temporal reference systems used in the data submission - this is only applicable to projection data'
    )
    vertical_extent = FormField(
        VerticalExtentForm,
        label='Vertical Extent',
        description='Measurement: Reference point used to describe vertical extents. E.g. MSL (mean sea level), masl (metres above sea level), mbgl (metres below ground level)'
    )
    bounding_box = FormField(GeoLocationBoxForm, label='Geolocation Box')


class SubmissionDataUploadForm(BaseForm):
    dataset = FileField('Dataset')
