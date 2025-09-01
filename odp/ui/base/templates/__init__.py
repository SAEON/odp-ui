import json
import re
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from functools import partial
from pathlib import Path
from random import randint
from typing import Any
from zoneinfo import ZoneInfo

from flask import Flask

from odp.const import DOI_REGEX, ODPMetadataSchema


def init_app(app: Flask):
    """Set up common template filters."""

    @app.template_filter()
    def bytes(value: int, verbose=False) -> str:
        """Format a file or memory size value using 1024-based units.
        `verbose=True` prints the bytes value in brackets if value >= 1024.
        """
        if not isinstance(value, int):
            return value

        if value < 1024:
            return f'{value} bytes'

        parenthetical = f' ({value} bytes)' if verbose else ''

        for unit in 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB':
            value /= 1024
            if value < 1024:
                return f'{value:.1f} {unit}{parenthetical}'

    @app.template_filter()
    def format_json(obj: Any) -> str:
        """Return nicely formatted JSON."""
        return json.dumps(obj, indent=4, ensure_ascii=False)

    @app.template_filter()
    def timestamp(value: str) -> str:
        """Return a nicely formatted timestamp from an ISO 8601 datetime string."""
        if not value:
            return ''
        dt = datetime.fromisoformat(value).astimezone(ZoneInfo('Africa/Johannesburg'))
        return dt.strftime('%d %b %Y, %H:%M %Z')

    @app.template_filter()
    def date(value: str) -> str:
        """Return a nicely formatted date from an ISO 8601 datetime string."""
        if not value:
            return ''
        dt = datetime.fromisoformat(value).astimezone(ZoneInfo('Africa/Johannesburg'))
        return dt.strftime('%d %b %Y')

    @app.template_filter()
    def uncamel(value: str) -> str:
        """Format a camel-cased value as a title string.
        e.g. 'IsDescribedBy' becomes 'Is Described By'
             'pointOfContact' becomes 'Point Of Contact'
        """
        value = value[0].upper() + value[1:]
        return ' '.join(re.findall('[A-Z][a-z]*', value))

    @app.template_filter()
    def doi(value: str) -> str | None:
        """Pull a DOI out of `value`."""
        if match := re.search(DOI_REGEX[1:], value):
            return match.group(0)

    @app.template_filter()
    def metadata_title(package_or_record: dict) -> str:
        """Get the title out of the metadata of the given ODP package/record (API output dict)."""
        try:
            if package_or_record['schema_id'] == ODPMetadataSchema.SAEON_DATACITE4:
                return package_or_record['metadata']['titles'][0]['title']
            if package_or_record['schema_id'] == ODPMetadataSchema.SAEON_ISO19115:
                return package_or_record['metadata']['title']
        except (KeyError, IndexError):
            pass

        return ''

    @app.template_filter()
    def keyword(keyword_id: int) -> dict:
        """Return the keyword object for a keyword code.
        The cli client must have scope `odp.keyword:read_all`.
        This will fail horrifically if there is an API error.
        """
        from odp.ui.base import cli

        if cached_kw_obj := cli.cache.jget('keyword', str(keyword_id)):
            return cached_kw_obj

        kw_obj = cli.get(f'/keyword/{keyword_id}')

        # For keywords awaiting approval, expire quickly, otherwise keep
        # cached for between 7 and 14 days. Keyword objects will rarely
        # change, but we must expire them in case they ever do.
        if kw_obj['status'] == 'proposed':
            expiry = 3600
        else:
            expiry = randint(604800, 1209600)

        cli.cache.jset('keyword', str(keyword_id), value=kw_obj, expiry=expiry)

        return kw_obj

    @app.template_filter()
    def folder(path: str) -> str:
        """Return the folder part of a file path."""
        return str(Path(path).parent)

    @app.template_filter()
    def filename(path: str) -> str:
        """Return the filename part of a file path."""
        return Path(path).name


class ButtonTheme(str, Enum):
    primary = 'primary'
    secondary = 'secondary'
    info = 'info'
    success = 'success'
    warning = 'warning'
    danger = 'danger'
    light = 'light'
    dark = 'dark'


@dataclass
class Button:
    label: str
    endpoint: str
    theme: ButtonTheme
    outline: bool = True
    prompt: str = None
    prompt_args: tuple = ()
    object_id: str = None
    scope: str = None
    description: str = None
    endpoint_params: dict = None


create_btn = partial(
    Button,
    label='Create',
    endpoint='.create',
    theme=ButtonTheme.success,
)

edit_btn = partial(
    Button,
    label='Edit',
    endpoint='.edit',
    theme=ButtonTheme.primary,
)

delete_btn = partial(
    Button,
    label='Delete',
    endpoint='.delete',
    theme=ButtonTheme.danger,
    prompt='Are you sure you want to delete %s? This cannot be undone!',
)
