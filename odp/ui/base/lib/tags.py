from typing import Callable, Type

from flask import Response, flash, g, redirect, render_template, request, url_for
from flask_login import current_user

from odp.const import ODPCollectionTag, ODPRecordTag, ODPScope, ODPVocabulary
from odp.lib.client import ODPAPIError
from odp.ui.base import api
from odp.ui.base.forms import BaseForm, KeywordTagForm
from odp.ui.base.lib.utils import pagify, populate_keyword_choices


def get_tag_instance(obj: dict, tag_id: str, user: bool = False) -> dict | None:
    """Get a single tag instance for a record or collection.

    The tag should have cardinality 'one' or 'user'; if 'user',
    set `user=True` to get the tag instance for the current user.
    """
    return next(
        (tag for tag in obj['tags'] if tag['tag_id'] == tag_id and (
                not user or tag['user_id'] == current_user.id
        )), None
    )


def get_tag_instances(obj: dict, tag_id: str) -> dict:
    """Get a page result of tag instances (with cardinality
    'user' or 'multi') for a record or collection."""
    return pagify(
        [tag for tag in obj['tags'] if tag['tag_id'] == tag_id]
    )


def tag_singleton(obj_type: str, obj_id: str, tag_id: str) -> Response:
    """Set a singleton tag (cardinality 'one') on a record or collection.

    This is a view function and returns a redirect to the record or
    collection view page."""
    api.post(f'/{obj_type}/{obj_id}/tag', dict(
        tag_id=tag_id,
        data={},
    ))
    flash(f'{tag_id} tag has been set.', category='success')
    return redirect(url_for('.detail', id=obj_id))


def untag_singleton(obj_type: str, obj_id: str, tag_id: str) -> Response:
    """Remove a singleton tag (cardinality 'one') from a record or collection.

    This is a view function and returns a redirect to the record or
    collection view page."""
    api_route = f'/{obj_type}/'
    if obj_type == 'collection':
        admin_scope = ODPScope.COLLECTION_ADMIN
    elif obj_type == 'record':
        admin_scope = ODPScope.RECORD_ADMIN

    if admin_scope in g.user_permissions:
        api_route += 'admin/'

    obj = api.get(f'/{obj_type}/{obj_id}')
    if tag_instance := get_tag_instance(obj, tag_id):
        api.delete(f'{api_route}{obj_id}/tag/{tag_instance["id"]}')
        flash(f'{tag_id} tag has been removed.', category='success')

    return redirect(url_for('.detail', id=obj_id))


def tag_keyword_deprecated(
        obj_type: str,
        obj_id: str,
        tag_id: str,
        vocab_id: str,
        form_cls: Type[BaseForm],
        tag_endpoint: str,
        keyword_choices_fn: Callable = None,
) -> Response | str:
    """Set a project/infrastructure tag on a collection.

    This function is retained to allow project/infrastructure collection
    tags using their existing schemas. Some API and migration work is
    needed to align these tags with the new keyword tag structure.
    """
    obj = api.get(f'/{obj_type}/{obj_id}')
    vocab_field = vocab_id.lower()

    if request.method == 'POST':
        form = form_cls(request.form)
    else:
        form = form_cls()

    if not keyword_choices_fn:
        keyword_choices_fn = populate_keyword_choices

    keyword_choices_fn(form[vocab_field], vocab_id, include_none=True)

    if request.method == 'POST' and form.validate():
        try:
            api.post(f'/{obj_type}/{obj_id}/tag', dict(
                tag_id=tag_id,
                data={
                    vocab_field: form[vocab_field].data,
                    'comment': form.comment.data,
                },
            ))
            flash(f'{tag_id} tag has been set.', category='success')
            return redirect(url_for('.detail', id=obj_id))

        except ODPAPIError as e:
            if response := api.handle_error(e):
                return response

    return render_template(
        f'{obj_type}_tag_edit.html', **{f'{obj_type}': obj},
        tag_endpoint=tag_endpoint, form=form,
    )


def tag_keyword(
        obj_type: str,
        obj_id: str,
        tag_id: ODPCollectionTag | ODPRecordTag,
        vocab_id: ODPVocabulary,
        tag_endpoint: str,
        keyword_choices_fn: Callable = None,
) -> Response | str:
    """Set a keyword tag on a record or collection.

    This is a view function and returns either a redirect or a rendered template.

    :param obj_type: 'collection' | 'record'
    :param obj_id: collection id or record id
    :param tag_id: tag id
    :param vocab_id: vocabulary id
    :param tag_endpoint: view endpoint, e.g. '.tag_sdg'
    :param keyword_choices_fn: function for populating the choices for the
        keyword select field; must have the same signature as (the default)
        populate_keyword_choices
    """
    obj = api.get(f'/{obj_type}/{obj_id}')

    if request.method == 'POST':
        form = KeywordTagForm(request.form)
    else:
        # (existing) vocabulary tags have cardinality 'multi', so this will
        # always be an insert - i.e. don't populate form for update
        # todo: generalize; a vocabulary tag may have any cardinality
        form = KeywordTagForm(data=dict(vocabulary=vocab_id.value))

    if not keyword_choices_fn:
        keyword_choices_fn = populate_keyword_choices

    keyword_choices_fn(form.keyword, vocab_id, include_none=True)

    if request.method == 'POST' and form.validate():
        try:
            api.post(f'/{obj_type}/{obj_id}/tag', dict(
                tag_id=tag_id,
                data={
                    'vocabulary': vocab_id,
                    'keyword': form.keyword.data,
                    'comment': form.comment.data,
                },
            ))
            flash(f'{tag_id} tag has been set.', category='success')
            return redirect(url_for('.detail', id=obj_id))

        except ODPAPIError as e:
            if response := api.handle_error(e):
                return response

    return render_template(
        f'{obj_type}_tag_edit.html', **{f'{obj_type}': obj},
        tag_endpoint=tag_endpoint, form=form,
    )


def untag_keyword(
        obj_type: str,
        obj_id: str,
        tag_id: str,
        tag_instance_id: str,
) -> Response:
    """Remove a vocabulary keyword tag from a record or collection.

    This is a view function and returns a redirect to the record or
    collection view page.
    """
    api_route = f'/{obj_type}/'
    if obj_type == 'collection':
        admin_scope = ODPScope.COLLECTION_ADMIN
    elif obj_type == 'record':
        admin_scope = ODPScope.RECORD_ADMIN

    if admin_scope in g.user_permissions:
        api_route += 'admin/'

    api.delete(f'{api_route}{obj_id}/tag/{tag_instance_id}')
    flash(f'{tag_id} tag has been removed.', category='success')

    return redirect(url_for('.detail', id=obj_id))
