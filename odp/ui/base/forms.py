import json
import re
from datetime import datetime

from flask import Flask, request, session
from werkzeug.utils import secure_filename
from wtforms import BooleanField, DateField, FloatField, Form, SelectField, SelectMultipleField, StringField, TextAreaField, ValidationError
from wtforms.csrf.session import SessionCSRF
from wtforms.validators import optional
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

    def __init__(self, *args, **kwargs):
        """Set dynamic_choices=True for multi-select fields that are
        dynamically populated in the browser. This causes the normal
        choices validation to be skipped."""
        self.dynamic_choices = kwargs.pop('dynamic_choices', False)
        super().__init__(*args, **kwargs)

    def pre_validate(self, form):
        if self.dynamic_choices:
            return

        super().pre_validate(form)


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


def file_required(message='Please select a file.'):
    """A FileField validator that ensures that a file is selected."""

    def validator(form, field):
        if not (file := request.files.get(field.id)) or not secure_filename(file.filename):
            raise ValidationError(message)

    return validator


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
