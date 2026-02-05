import json
import logging
import secrets
from dataclasses import asdict, dataclass
from functools import wraps
from typing import Optional

import requests
from authlib.integrations.flask_client import OAuth
from flask import Flask, Response, flash, g, redirect, request, session, url_for
from flask_login import LoginManager, current_user, login_user, logout_user
from redis import Redis

from odp.config import config
from odp.const import ODPScope
from odp.lib.cache import Cache
from odp.lib.client import ODPAPIError, ODPBaseClient, ODPClient

logger = logging.getLogger(__name__)


@dataclass
class LocalUser:
    """Represents a client-side, logged-in user. Compatible with Flask-Login."""

    id: str
    name: str
    email: str
    active: bool
    verified: bool
    picture: Optional[str]
    role_ids: list[str]

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    @property
    def is_active(self):
        return self.active and self.verified

    def get_id(self):
        return self.id


class ODPAnonClient(ODPClient):
    """An ODP client for Flask apps, providing anonymous access to the ODP API."""

    def __init__(
            self,
            api_url: str,
            hydra_url: str,
            client_id: str,
            client_secret: str,
            scope: list[str],
    ) -> None:
        super().__init__(api_url, hydra_url, client_id, client_secret, scope)
        self.cache = Cache(client_id)

    @staticmethod
    def view():
        """Decorator for a blueprint view function, providing API error handling."""

        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                try:
                    # call the view function and return its response
                    return f(*args, **kwargs)

                except ODPAPIError as e:
                    if response := _handle_error(e):
                        return response

                    # return home to avoid redirect loops
                    return redirect(url_for('home.index'))

            return decorated_function

        return decorator


class ODPUserClient(ODPBaseClient):
    """An ODP client for Flask apps, providing signup, login and logout,
    and API access with a logged in user's access token."""

    def __init__(
            self,
            api_url: str,
            hydra_url: str,
            client_id: str,
            client_secret: str,
            scope: list[str],
            cache: Redis,
            app: Flask,
    ) -> None:
        super().__init__(api_url, hydra_url, client_id, client_secret, scope)
        self.cache = cache
        self.oauth = OAuth(
            app=app,
            cache=cache,
            fetch_token=self._fetch_token,
            update_token=self._update_token,
        )
        self.oauth.register(
            name='hydra',
            client_id=client_id,
            client_secret=client_secret,
            client_kwargs={'scope': ' '.join(scope)},
            server_metadata_url=f'{hydra_url}/.well-known/openid-configuration',
        )

        app.add_url_rule('/oauth2/signup', endpoint='hydra.signup', view_func=self._signup)
        app.add_url_rule('/oauth2/login', endpoint='hydra.login', view_func=self._login)
        app.add_url_rule('/oauth2/logout', endpoint='hydra.logout', view_func=self._logout)
        app.add_url_rule('/oauth2/logged_in', endpoint='hydra.logged_in', view_func=self._logged_in)
        app.add_url_rule('/oauth2/logged_out', endpoint='hydra.logged_out', view_func=self._logged_out)

        login_manager = LoginManager(app)

        @login_manager.user_loader
        def load_user(user_id):
            return self._get_user(user_id)

    @property
    def token(self) -> dict:
        return self.oauth.fetch_token('hydra')

    def _send_request(
            self,
            method: str,
            url: str,
            data: dict | None,
            files: dict | None,
            params: dict,
            headers: dict,
    ) -> requests.Response:
        """Send a request to the API with the user's access token."""
        return self.oauth.hydra.request(
            method,
            url,
            json=data,
            files=files,
            params=params,
            headers=headers,
        )

    def _signup(self):
        """Initiate signup.

        Return a redirect to the Hydra authorization endpoint.
        """
        redirect_uri = url_for('hydra.logged_in', _external=True)
        return self.oauth.hydra.authorize_redirect(redirect_uri, mode='signup')

    def _login(self):
        """Initiate login.

        Return a redirect to the Hydra authorization endpoint.
        """
        redirect_uri = url_for('hydra.logged_in', _external=True)
        return self.oauth.hydra.authorize_redirect(redirect_uri, mode='login')

    def _logged_in(self):
        """Callback from Hydra after a successful login via the identity service.

        Fetch and cache the token, user info and permissions, and log the user
        in to the app.
        """
        token = self.oauth.hydra.authorize_access_token()
        userinfo = token.pop('userinfo')

        localuser = LocalUser(
            id=(user_id := userinfo['sub']),
            name=userinfo['name'],
            email=userinfo['email'],
            verified=userinfo['email_verified'],
            picture=userinfo['picture'],
            role_ids=userinfo['roles'],
            active=True,  # we'll only get to this point if the user is active
        )

        self.cache.hset(self._cache_key(user_id, 'token'), mapping=token)
        self.cache.set(self._cache_key(user_id, 'user'), json.dumps(asdict(localuser)))

        try:
            # force use of the ODP API token endpoint, in case we are cliented to another API
            token_data = self.get('/token/', api_url=config.ODP.API_URL)
            user_permissions = token_data['permissions']
            self.cache.set(self._cache_key(user_id, 'permissions'), json.dumps(user_permissions))

        except ODPAPIError as e:
            if e.status_code == 403:
                # the client and/or role does not require knowledge of permissions
                # so we continue without them
                pass
            else:
                # something else went wrong; the user can try logging in again later
                self.handle_error(e)
                return redirect(url_for('home.index'))

        login_user(localuser)

        active_page = session.get('active_page_url') or url_for('home.index')

        return redirect(active_page)

    def _logout(self):
        """Initiate logout.

        Return a redirect to the Hydra endsession endpoint.
        """
        redirect_uri = url_for('hydra.logged_out', _external=True)

        if user_id := current_user.get_id():
            state_val = secrets.token_urlsafe()
            self.cache.set(self._cache_key(user_id, 'state'), state_val, ex=10)
            url = f'{self.hydra_url}/oauth2/sessions/logout' \
                  f'?id_token_hint={self.token.get("id_token")}' \
                  f'&post_logout_redirect_uri={redirect_uri}' \
                  f'&state={state_val}'

            return redirect(url)

        return redirect(url_for('home.index'))

    def _logged_out(self):
        """Callback from Hydra after logging out via the identity service.

        Log the user out of the app.
        """
        if user_id := current_user.get_id():
            state_val = request.args.get('state')
            if state_val == self.cache.get(key := self._cache_key(user_id, 'state')):
                logout_user()
                self.cache.delete(key)

        return redirect(url_for('home.index'))

    def _get_user(self, user_id):
        """Return the cached user object."""
        if serialized_user := self.cache.get(self._cache_key(user_id, 'user')):
            return LocalUser(**json.loads(serialized_user))

    def _get_permissions(self, user_id):
        """Return the cached user permissions."""
        if serialized_permissions := self.cache.get(self._cache_key(user_id, 'permissions')):
            return json.loads(serialized_permissions)
        return {}

    def _cache_key(self, user_id, key):
        return f'{self.__class__.__name__}.{self.client_id}.{user_id}.{key}'

    def _fetch_token(self, hydra):
        # logger.debug('_fetch_token')
        if user_id := current_user.get_id():
            token = self.cache.hgetall(self._cache_key(user_id, 'token'))
            # logger.debug('token.access_token = %s', token['access_token'])
            # logger.debug('token.refresh_token = %s', token['refresh_token'])
            return token

    def _update_token(self, hydra, token, refresh_token=None, access_token=None):
        # logger.debug(f'_update_token({refresh_token=}, {access_token=})')
        if user_id := current_user.get_id():
            # logger.debug('token.access_token = %s', token['access_token'])
            # logger.debug('token.refresh_token = %s', token['refresh_token'])
            self.cache.hset(self._cache_key(user_id, 'token'), mapping=token)
            self.oauth.hydra.token = token

    def view(self, scope: ODPScope):
        """Decorate a blueprint view function to enable client-side authorization
        (requiring `scope` for API access) and API error handling."""

        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                if not current_user.is_authenticated:
                    flash('Please log in to access that page.', category='info')
                    return redirect(url_for('home.index'))

                try:
                    g.user_permissions = self._get_permissions(current_user.id)
                    if scope not in g.user_permissions:
                        flash('You do not have permission to access that page.', category='warning')
                        return redirect(request.referrer or url_for('home.index'))

                    # call the view function and return its response
                    return f(*args, **kwargs)

                except ODPAPIError as e:
                    if response := self.handle_error(e):
                        return response

                    if e.status_code >= 500:
                        # avoid redirect loops for server errors
                        return redirect(url_for('home.index'))

                    return redirect(request.referrer or url_for('home.index'))

            return decorated_function

        return decorator

    def user(self):
        """Simplified view decorator that can be used in conjunction with
        `@cli.view()` to populate g.user_permissions if the user is logged in."""

        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                if current_user.is_authenticated:
                    g.user_permissions = self._get_permissions(current_user.id)

                # call the view function and return its response
                return f(*args, **kwargs)

            return decorated_function

        return decorator

    @staticmethod
    def handle_error(e: ODPAPIError) -> Response | None:
        return _handle_error(e)


def _handle_error(e: ODPAPIError) -> Response | None:
    """For authentication and authorization errors we bail out and return
    an appropriate redirect. For any other kind of error, we just display
    the error message and let the caller decide what to do."""

    if e.status_code == 401:
        flash('Your session has expired. Please log in again to continue.', category='error')
        return redirect(url_for('hydra.logout'))

    if e.status_code == 403:
        flash('You do not have permission to access that page.', category='warning')
        return redirect(request.referrer or url_for('home.index'))

    if e.status_code == 503:
        flash('Service unavailable. Please try again in a few minutes.', category='error')
        return

    try:
        detail = e.error_detail['detail']
        if e.status_code == 422 and isinstance(detail, list):
            # duplicate validation errors are returned when multiple
            # server-side dependencies validate the same input; we
            # eliminate duplicates by packing them into a dict
            errors = {
                error['loc'][1]: error['msg']
                for error in detail
            }
            for field, msg in errors.items():
                flash(f'{field}: {msg}', category='error')
        else:
            flash(detail, category='error')

    except (TypeError, KeyError, IndexError):
        flash(e.error_detail, category='error')
