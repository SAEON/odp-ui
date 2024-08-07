from pathlib import Path

import redis
from flask import Flask, session, request
from jinja2 import ChoiceLoader, FileSystemLoader
from werkzeug.middleware.proxy_fix import ProxyFix

import odp.logfile
from odp.config import config
from odp.ui.base import forms, templates, views
from odp.ui.client import ODPAnonClient, ODPUserClient
from odp.version import VERSION

api: ODPUserClient
"""ODP client for user-authenticated API access."""

cli: ODPAnonClient
"""ODP client for client-authenticated API access."""


def init_app(
        app: Flask,
        *,
        user_api: bool = False,
        client_api: bool = False,
        template_dir: Path,
        macro_dir: Path = None,
        api_url: str = None
):
    """Base initialization for an ODP UI application.

    :param app: Flask app instance
    :param user_api: create an ODP client (`api`) for user-authenticated API access
    :param client_api: create an ODP client (`cli`) for client-authenticated API access
    :param template_dir: the app's local template directory
    :param macro_dir: the app's local macro directory
    :param api_url: the app's api url. Defaults to the URL of the ODP API if not specified.
    """
    odp.logfile.initialize()

    if api_url is None:
        api_url = config.ODP.API_URL

    app.config.update(
        ODP_ADMIN_URL=config.ODP.ADMIN_URL,
        ODP_ENV=config.ODP.ENV.value,
        ODP_VERSION=VERSION,
        SESSION_COOKIE_NAME=f'{app.name}.session',
        SESSION_COOKIE_SAMESITE='Lax',
        SESSION_COOKIE_SECURE=True,
    )

    if user_api:
        global api
        api = ODPUserClient(
            api_url=api_url,
            hydra_url=config.HYDRA.PUBLIC.URL,
            client_id=app.config['UI_CLIENT_ID'],
            client_secret=app.config['UI_CLIENT_SECRET'],
            scope=app.config['UI_CLIENT_SCOPE'],
            cache=redis.Redis(
                host=config.REDIS.HOST,
                port=config.REDIS.PORT,
                db=config.REDIS.DB,
                decode_responses=True,
            ),
            app=app,
        )

    if client_api:
        global cli
        cli = ODPAnonClient(
            api_url=api_url,
            hydra_url=config.HYDRA.PUBLIC.URL,
            client_id=app.config['CI_CLIENT_ID'],
            client_secret=app.config['CI_CLIENT_SECRET'],
            scope=app.config['CI_CLIENT_SCOPE'],
        )

    base_dir = Path(__file__).parent

    directories = [
        FileSystemLoader(template_dir),
        FileSystemLoader(base_dir / 'macros'),
        FileSystemLoader(base_dir / 'templates'),
    ]

    if macro_dir is not None:
        directories.append(FileSystemLoader(macro_dir))

    app.jinja_loader = ChoiceLoader(directories)
    app.static_folder = base_dir / 'static'

    forms.init_app(app)
    templates.init_app(app)
    views.init_app(app)

    # trust the X-Forwarded-* headers set by the proxy server
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_prefix=1)

    @app.context_processor
    def set_active_url():
        session['active_page_url'] = request.url
        return dict()
