import json
import re
from datetime import datetime

from flask import Flask, session
from wtforms import BooleanField, DateField, FloatField, Form, SelectField, SelectMultipleField, StringField, \
    TextAreaField, ValidationError
from wtforms.csrf.session import SessionCSRF
from wtforms.validators import optional, email, input_required
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