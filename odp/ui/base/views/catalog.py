import json
from pathlib import Path
from random import randint
from typing import Optional

from flask import Blueprint, abort, current_app, make_response, redirect, render_template, request, url_for, Response, \
    jsonify

from odp.const import ODPMetadataSchema
from odp.lib.client import ODPAPIError
from odp.ui.base import api, cli
from odp.ui.base.forms import SearchForm

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

    # Rename facet titles for display and hide Keyword facet from sidebar
    if result and isinstance(result, dict) and 'facets' in result:
        if 'EOV' in result['facets']:
            result['facets']['Essential Ocean Variables'] = result['facets'].pop('EOV')
        if 'EBV' in result['facets']:
            result['facets']['Essential Biodiversity Variables'] = result['facets'].pop('EBV')
        if 'SDG' in result['facets']:
            result['facets']['SDG Variables'] = result['facets'].pop('SDG')
        # Hide Keyword facet from sidebar (but keep it for filtering via URLs)
        result['facets'].pop('Keyword', None)
        result['facets'].pop('SDG Variables', None)

    # Rename facet field names for display and hide Keyword facet from sidebar
    if 'EOV' in facet_fields:
        facet_fields['Essential Ocean Variables'] = facet_fields.pop('EOV')
    if 'EBV' in facet_fields:
        facet_fields['Essential Biodiversity Variables'] = facet_fields.pop('EBV')
    if 'SDG' in facet_fields:
        facet_fields['SDG Variables'] = facet_fields.pop('SDG')
    # Hide Keyword facet from sidebar display (keep in API for URL-based filtering)
    facet_fields.pop('Keyword', None)
    facet_fields.pop('SDG Variables', None)

    return render_template(
        'catalog_index.html',
        form=SearchForm(request.args),
        result=result,
        facet_fields=facet_fields,
        app_name=client_id
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
    # This allows the template to know which facet each keyword belongs to
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
            current_app.logger.info(f"Fetched facet_values: {facet_values}")
        else:
            current_app.logger.warning(f"No facets in search_result: {search_result}")
    except Exception as e:
        current_app.logger.error(f"Could not fetch facet values: {e}", exc_info=True)

    return render_template(
        'catalog_record.html',
        record=record,
        facet_values=facet_values,
        app_name=client_id
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

    # Retrieve page and size from request parameters, defaulting if not present
    page = request.args.get('page', 1, type=int)
    size = request.args.get('size', 50, type=int)

    # Pass parameters as keyword arguments to handle encoding automatically
    catalog_record_list = cli.get(
        f'/catalog/{catalog_id}/subset',
        record_id_or_doi_list=record_ids,
        page=page,
        size=size
    )

    client_id = api.client_id.split('.')[0]

    return render_template(
        'catalog_subset.html',
        catalog_record_list=catalog_record_list,
        app_name=client_id
    )

@bp.route('/generate-zip-bundle', methods=['POST'])
def generate_zip_bundle():
    """
    Proxy endpoint for server-side ZIP bundle generation.

    Receives record IDs and user data from the UI frontend,
    forwards the request to the ODP API server for ZIP generation,
    and returns the binary ZIP file to the client.

    Avoids CORS issues by routing through the UI server.

    Request body:
    {
        "record_ids": ["ABC", "DEF"],
        "user_data": {
            "name": "User Name",
            "email": "user@example.com",
            "organisation": "University"
        }
    }

    Response: Binary ZIP file with ZIP content headers
    """
    payload = request.json
    if not payload:
        return jsonify({'error': 'No JSON payload received'}), 400

    try:
        # Forward request to ODP API server
        api_response = cli.post('/catalog/generate-zip-bundle', payload, return_bytes=True)

        # Return binary ZIP file with proper headers
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
        try:
            error_data = e.response.json()
            status_code = e.response.status_code
        except:
            error_data = {'error': str(e)}
            status_code = 500

        return jsonify(error_data), status_code


@bp.route('/download-audit', methods=['POST'])
def download_audit():
    """
    Proxy endpoint to receive an audit log from the UI
    and forward it to the main download audit API.
    """
    payload = request.json
    if not payload:
        return jsonify({'error': 'No JSON payload received'}), 400

    try:
        # cli.post() returns parsed JSON response, already handled errors
        response_data = cli.post('/download/audit', payload)
        return jsonify(response_data), 201

    except Exception as e:
        current_app.logger.error(f"Download audit failed: {str(e)}", exc_info=True)
        try:
            error_data = e.response.json()
            status_code = e.response.status_code
        except:
            error_data = {'error': str(e)}
            status_code = 500

        return jsonify(error_data), status_code
