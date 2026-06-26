import json
from pathlib import Path
from random import randint
import requests as http_requests
from flask import Blueprint, abort, current_app, flash, jsonify, make_response, redirect, render_template, request, stream_with_context, url_for, Response

from odp.const import ODPMetadataSchema
from odp.lib.client import ODPAPIError
from odp.ui.base import api, cli
from odp.ui.base.forms import SearchForm,DownloadAuditForm

bp = Blueprint(
    'catalog', __name__,
    static_folder=Path(__file__).parent.parent / 'static',
)

client_id = api.client_id.split('.')[0]

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


def _select_metadata(record: dict, schema_id: ODPMetadataSchema) -> dict | None:
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
def select_iso19115_metadata(record: dict) -> dict | None:
    """Select the ISO19115 metadata dict, if present."""
    return _select_metadata(record, ODPMetadataSchema.SAEON_ISO19115)


@bp.app_template_filter()
def select_schemaorg_metadata(record: dict) -> dict | None:
    """Select the schema.org (JSON-LD) metadata dict, if present."""
    return _select_metadata(record, ODPMetadataSchema.SCHEMAORG_DATASET)


@bp.app_template_filter()
def select_ris_metadata(record: dict) -> dict | None:
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

    show_bulk_download = client_id in current_app.config.get('BULK_DOWNLOAD_CLIENTS', ['MIMS'])

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
        show_bulk_download_options=(client_id in current_app.config.get('BULK_DOWNLOAD_CLIENTS', ['MIMS']))
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
        show_bulk_download_options=(client_id in current_app.config.get('BULK_DOWNLOAD_CLIENTS', ['MIMS'])),
        facet_values={},
    )

@bp.route('/download-bundle', methods=['POST'])
def download_bundle():
    """
    Accepts JSON from the browser fetch(). Validates user fields, forwards to
    /catalog/metadata-bundle on the API server, returns JSON to the browser.
    """
    data = request.get_json(silent=True) or {}
    user_data = data.get('user_data', {})

    if not all(user_data.get(f) for f in ('name', 'email', 'organisation')):
        return jsonify({'error': 'name, email and organisation are required'}), 400

    record_ids = data.get('record_ids', [])
    if not record_ids:
        return jsonify({'error': 'No records selected'}), 400

    payload = {
        'record_ids': record_ids,
        'user_data': user_data,
        'client_ip': request.remote_addr,
        'user_agent': request.headers.get('User-Agent'),
        'referer': request.referrer,
    }

    try:
        result = cli.post('/catalog/metadata-bundle', payload)
        return jsonify(result)
    except Exception as e:
        current_app.logger.error(f"Metadata bundle request failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to generate metadata bundle'}), 500


@bp.route('/proxy-download')
def proxy_download():
    """
    Proxies a data file from external storage to the browser.
    Used as a CORS fallback when the browser cannot fetch directly.
    Only allows URLs from repository.ocean.gov.za.
    """
    url = request.args.get('url', '')
    if not url.startswith('https://repository.ocean.gov.za/'):
        return jsonify({'error': 'URL not allowed'}), 403

    try:
        upstream = http_requests.get(url + '/download', stream=True, timeout=60)
        upstream.raise_for_status()
        content_type = upstream.headers.get('Content-Type', 'application/octet-stream')
        content_disposition = upstream.headers.get('Content-Disposition', '')

        def generate():
            for chunk in upstream.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk

        resp = Response(stream_with_context(generate()), content_type=content_type)
        if content_disposition:
            resp.headers['Content-Disposition'] = content_disposition
        return resp
    except Exception as e:
        current_app.logger.error(f"Proxy download failed for {url}: {e}")
        return jsonify({'error': 'Proxy download failed'}), 502


@bp.route('/download-progress')
def download_progress():
    return render_template('download_progress.html')