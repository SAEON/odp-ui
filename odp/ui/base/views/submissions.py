from pathlib import Path

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user

from odp.const import ODPScope
from odp.const.db import SubmissionStatus
from odp.lib.client import ODPAPIError
from odp.ui.base import api, cli
from odp.ui.base.forms import SubmissionForm, SubmissionDataUploadForm
from odp.ui.base.templates import create_btn
from odp.ui.base.views import utils

bp = Blueprint(
    'submissions', __name__,
    static_folder=Path(__file__).parent.parent / 'static',
)


@bp.route('/')
@api.view(ODPScope.SUBMISSION_READ)
def index():
    page = request.args.get('page', 1)

    submissions = []

    if current_user.is_authenticated:
        submissions = api.get(
            '/submission/user_submissions',
            user_id=current_user.id,
            page=page,
        )

    return render_template(
        'submission_index.html',
        submissions=submissions,
        buttons=[
            create_btn(),
        ],
    )


@bp.route('/<id>')
@api.view(ODPScope.SUBMISSION_READ)
def detail(id):
    if not current_user.is_authenticated:
        flash('Please log in to access that page.', 'warning')
        return redirect(url_for('.index'))

    submission = api.get(f'/submission/{id}', user_id=current_user.id)

    buttons_enabled = (submission['status'] == SubmissionStatus.in_progress)

    return render_template(
        'submission_detail.html',
        submission=submission,
        buttons_enabled=buttons_enabled,
    )


@bp.route('/new', methods=['GET', 'POST'])
@api.view(ODPScope.SUBMISSION_WRITE)
def create():
    if not current_user.is_authenticated:
        flash('Please log in to access that page.', 'warning')
        return redirect(url_for('.index'))

    form = SubmissionForm(request.form)

    utils.populate_keywords_choices(form.keywords)
    utils.populate_instruments_choices(form.instruments)

    if request.method == 'POST' and form.validate():
        api_route = '/submission/'

        cleaned_data = utils.clean_submission_data(form.data)

        try:
            submission = api.post(
                api_route,
                dict(
                    data=cleaned_data,
                    user_id=current_user.id,
                ))

            flash(f'Metadata submitted successfully.', category='success')
            return redirect(url_for('.upload', id=submission['id']))

        except ODPAPIError as e:
            if response := api.handle_error(e):
                return response

    return render_template(
        'submission_edit.html',
        form=form,
        show_steps=True
    )


@bp.route('/<id>/upload', methods=['GET', 'POST'])
@api.view(ODPScope.SUBMISSION_WRITE)
def upload(id):
    submission = api.get(f'/submission/{id}', user_id=current_user.id)
    is_editing = bool(submission.get('dataset_file_name'))

    form = SubmissionDataUploadForm(request.form)
    form.dataset.data = request.files.get('dataset')

    if request.method == 'POST' and form.validate():

        if form.dataset.data:
            api_route = f'/submission/{id}/upload'

            try:

                api.put_files(
                    api_route,
                    files={'file': (form.dataset.data.filename, form.dataset.data.stream)}
                )

            except ODPAPIError as e:
                if response := api.handle_error(e):
                    return response

            flash(f'Dataset uploaded successfully.', category='success')

        elif form.dataset_link.data:
            api_route = f'/submission/{id}/dataset_url'

            try:

                api.post(
                    api_route,
                    data={},
                    dataset_url=form.dataset_link.data,
                    user_id=current_user.id,
                )

            except ODPAPIError as e:
                if response := api.handle_error(e):
                    return response

            flash(f'Dataset URL added successfully.', category='success')

        return redirect(url_for('.detail', id=id))

    return render_template(
        'submission_data_upload.html',
        form=form,
        submission_id=id,
        is_editing=is_editing
    )


@bp.route('/<id>/edit', methods=['GET', 'POST'])
@api.view(ODPScope.SUBMISSION_WRITE)
def edit(id):
    if not current_user.is_authenticated:
        flash('Please log in to access that page.', 'warning')
        return redirect(url_for('.index'))

    submission = api.get(f'/submission/{id}', user_id=current_user.id)

    submission_data = submission['data']

    form = SubmissionForm(request.form, data=submission_data)

    utils.populate_keywords_choices(form.keywords)
    utils.populate_instruments_choices(form.instruments)

    if request.method == 'GET':
        form.keywords.data = submission_data.get('keywords')
        form.instruments.data = submission_data.get('instruments')

    if request.method == 'POST' and form.validate():
        cleaned_data = utils.clean_submission_data(form.data)

        try:

            api.put(
                f'/submission/{id}',
                data=dict(cleaned_data),
                user_id=current_user.id
            )
            flash(f'Record {id} has been updated.', category='success')
            return redirect(url_for('.detail', id=id))

        except ODPAPIError as e:
            if response := api.handle_error(e):
                return response

    return render_template(
        'submission_edit.html',
        submission=submission,
        show_steps=False,
        form=form
    )


@bp.route('/<id>/submit', methods=['POST'])
@api.view(ODPScope.SUBMISSION_WRITE)
def submit(id):
    if not current_user.is_authenticated:
        flash('Please log in to access that page.', 'warning')
        return redirect(url_for('.index'))

    submission = api.post(
        f'/submission/submit/{id}',
        user_id=current_user.id,
        data={}
    )

    return render_template(
        'submission_detail.html',
        submission=submission
    )


@bp.route('/<id>/delete', methods=['POST', ])
@api.view(ODPScope.SUBMISSION_DELETE)
def delete(id):
    if not current_user.is_authenticated:
        flash('Please log in to access that page.', 'warning')
        return redirect(url_for('.index'))

    try:

        api.delete(f'/submission/{id}', user_id=current_user.id)

    except ODPAPIError as e:
        if response := api.handle_error(e):
            return response

    flash(f'Record {id} has been deleted.', category='success')
    return redirect(url_for('.index'))


@bp.route('/orcid/<id>')
@cli.view()
def get_orcid_info(id):
    if not current_user.is_authenticated:
        flash('Please log in to access that page.', 'warning')
        return redirect(url_for('.index'))

    return utils.get_orcid_info(id)
