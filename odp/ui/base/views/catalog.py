import json
from pathlib import Path
from random import randint
from typing import Optional

from flask import Blueprint, abort, current_app, flash, make_response, redirect, render_template, request, url_for, Response

from odp.const import ODPMetadataSchema
from odp.lib.client import ODPAPIError
from odp.ui.base import api, cli
from odp.ui.base.forms import SearchForm,DownloadAuditForm

bp = Blueprint(
    'catalog', __name__,
    static_folder=Path(__file__).parent.parent / 'static',
)

client_id = api.client_id.split('.')[0]
BULK_DOWNLOAD_CLIENTS = ['MIMS']

@bp.app_template_filter()
def doi_title(doi: str) -> str:
    """Get the title for the given DOI."""
    if cached_title := cli.cache.get(doi, 'title'):
        return cached_title

    catalog_id = current_app.config['CATALOG_ID']
    try:
        if title := cli.get(
                f'/catalog/{catalog_id}/getvalue/{doi}',
                schema_id=ODPMetadataSchema.SAEON_DATACITE4,
                json_pointer='/titles/0/title',
        ):
            cli.cache.set(doi, 'title', value=title, expiry=randint(604800, 1209600))

        return title

    except ODPAPIError:
        pass

    return ''


def _select_metadata(record: dict, schema_id: ODPMetadataSchema) -> Optional[dict]:
    return next(
        (metadata_record['metadata']
         for metadata_record in record['metadata_records']
         if metadata_record['schema_id'] == schema_id),
        None
    )


@bp.app_template_filter()
def select_datacite_metadata(record: dict) -> dict:
    """Select the DataCite metadata dict."""
    return _select_metadata(record, ODPMetadataSchema.SAEON_DATACITE4)


@bp.app_template_filter()
def select_iso19115_metadata(record: dict) -> Optional[dict]:
    """Select the ISO19115 metadata dict, if present."""
    return _select_metadata(record, ODPMetadataSchema.SAEON_ISO19115)


@bp.app_template_filter()
def select_schemaorg_metadata(record: dict) -> Optional[dict]:
    """Select the schema.org (JSON-LD) metadata dict, if present."""
    return _select_metadata(record, ODPMetadataSchema.SCHEMAORG_DATASET)


@bp.app_template_filter()
def select_ris_metadata(record: dict) -> Optional[dict]:
    """Select the RIS metadata dict, if present."""
    return _select_metadata(record, ODPMetadataSchema.RIS_CITATION)


def _format_facets(facets_dict: dict) -> dict:
    """
    Standardizes facet names for display and removes internal-only facets.

    """
    name_map = {
        'EOV': 'Essential Ocean Variables',
        'EBV': 'Essential Biodiversity Variables',
        'SDG': 'SDG Variables',
    }

    exclude = {'Keyword', 'SDG Variables'}

    formatted = {}
    for key, value in facets_dict.items():
        display_name = name_map.get(key, key)
        if display_name not in exclude:
            formatted[display_name] = value

    return formatted

@bp.route('/')
@cli.view()
def index():
    catalog_id = current_app.config['CATALOG_ID']
    facets = current_app.config['CATALOG_FACETS']

    text_query = request.args.get('q')
    north_bound = request.args.get('n')
    east_bound = request.args.get('e')
    south_bound = request.args.get('s')
    west_bound = request.args.get('w')
    start_date = request.args.get('after')
    end_date = request.args.get('before')
    exclusive_region = request.args.get('exclusive_region')
    exclusive_interval = request.args.get('exclusive_interval')
    sort = request.args.get('sort', 'rank desc')
    page = request.args.get('page', 1)

    facet_api_query = {}
    facet_ui_query = {}
    facet_fields = {}

    for facet_title in facets:
        facet_field = SearchForm.facet_fieldname(facet_title)
        facet_fields[facet_title] = facet_field
        if facet_value := request.args.get(facet_field):
            facet_api_query[facet_title] = facet_value
            facet_ui_query[facet_field] = facet_value

    result = cli.get(
        f'/catalog/{catalog_id}/search',
        text_query=text_query,
        facet_query=json.dumps(facet_api_query),
        north_bound=north_bound,
        east_bound=east_bound,
        south_bound=south_bound,
        west_bound=west_bound,
        start_date=start_date,
        end_date=end_date,
        exclusive_region=exclusive_region,
        exclusive_interval=exclusive_interval,
        sort=sort,
        page=page,
        size=25,
    )

    if result and isinstance(result, dict) and 'facets' in result:
        result['facets'] = _format_facets(result['facets'])

    facet_fields = _format_facets(facet_fields)

    show_bulk_download = client_id in BULK_DOWNLOAD_CLIENTS

    return render_template(
        'catalog_index.html',
        form=SearchForm(request.args),
        audit_form=DownloadAuditForm(),
        result=result,
        facet_fields=facet_fields,
        show_bulk_download_options=show_bulk_download
    )


@bp.route('/search', methods=('POST',))
def search():
    form = SearchForm(request.form)
    query = form.data
    query.pop('csrf_token')
    if not query['exclusive_region']:
        query.pop('exclusive_region')
    if not query['exclusive_interval']:
        query.pop('exclusive_interval')

    facets = current_app.config['CATALOG_FACETS']
    for facet_title in facets:
        if not query[facet_field := SearchForm.facet_fieldname(facet_title)]:
            query.pop(facet_field)

    return redirect(url_for('.index', **query))


@bp.route('/<path:id>')
@cli.view()
@api.user()
def view(id):
    catalog_id = current_app.config['CATALOG_ID']

    record = cli.get(f'/catalog/{catalog_id}/records/{id}')

    # Fetch all available facets to help with keyword routing
    facet_values = {}
    try:
        search_result = cli.get(
            f'/catalog/{catalog_id}/search',
            text_query=None,
            facet_query=None,
            page=1,
            size=1,
        )
        if search_result and 'facets' in search_result:
            # Facets come as list of tuples: [(value, count), (value, count), ...]
            # Extract just the values (first element of each tuple)
            facet_values = {facet: [val[0] if isinstance(val, (list, tuple)) else val for val in vals]
                            for facet, vals in search_result['facets'].items()}
    except Exception as e:
        current_app.logger.error(f"Could not fetch facet values: {e}", exc_info=True)

    return render_template(
        'catalog_record.html',
        record=record,
        facet_values=facet_values,
        audit_form=DownloadAuditForm(),
        show_bulk_download_options=(client_id in BULK_DOWNLOAD_CLIENTS)
    )


@bp.route('/sitemap.xml')
@cli.view()
def sitemap():
    catalog_id = current_app.config['CATALOG_ID']

    catalog = cli.get(f'/catalog/{catalog_id}')
    try:
        sitemap_xml = catalog['data']['sitemap.xml']
    except (KeyError, TypeError):
        abort(404)

    response = make_response(sitemap_xml)
    response.headers['Content-Type'] = 'application/xml'
    return response


@bp.route('/subset')
@cli.view()
def subset_record_list():
    catalog_id = current_app.config['CATALOG_ID']
    record_ids = request.args.getlist('record_id_or_doi_list')

    page = request.args.get('page', 1, type=int)
    size = request.args.get('size', 50, type=int)

    # Pass parameters as keyword arguments to handle encoding automatically
    catalog_record_list = cli.get(
        f'/catalog/{catalog_id}/subset',
        record_id_or_doi_list=record_ids,
        page=page,
        size=size
    )

    return render_template(
        'catalog_subset.html',
        catalog_record_list=catalog_record_list,
        audit_form=DownloadAuditForm(),
        show_bulk_download_options=(client_id in BULK_DOWNLOAD_CLIENTS),
        facet_values={},
    )

@bp.route('/download-audit', methods=['POST'])
def download_audit():
    """
    Validates the download audit form with WTForms, then forwards the request
    to the ODP API server for ZIP bundle generation and returns the file.
    """
    form = DownloadAuditForm(request.form)
    record_ids = request.form.getlist('record_ids')

    if not form.validate() or not record_ids:
        flash('Please fill in all required fields before downloading.')
        return redirect(request.referrer or url_for('catalog.index'))

    payload = {
        'record_ids': record_ids,
        'user_data': {
            'name': form.name.data,
            'email': form.email.data,
            'organisation': form.organisation.data,
        }
    }

    try:
        api_response = cli.post('/catalog/generate-zip-bundle', payload, return_bytes=True)
        return Response(
            api_response,
            mimetype='application/zip',
            headers={
                'Content-Disposition': 'attachment; filename="records.zip"',
                'Content-Length': str(len(api_response))
            }
        )

    except Exception as e:
        current_app.logger.error(f"ZIP generation failed: {str(e)}", exc_info=True)
        flash('Failed to generate ZIP bundle. Please try again.')
        return redirect(request.referrer or url_for('catalog.index'))