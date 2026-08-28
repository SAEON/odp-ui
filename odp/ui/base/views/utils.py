import requests

from odp.config import config

KEYWORDS_URL = 'https://cmr.earthdata.nasa.gov/search/keywords/'


def populate_keywords_choices(field):
    field.choices = get_keywords('science_keywords')


def populate_instruments_choices(field):
    field.choices = get_keywords('instruments')


def populate_location_choices(field):
    field.choices = get_keywords('location_keywords')


def get_keywords(keyword_type):
    keyword_response = requests.get(f'{KEYWORDS_URL}{keyword_type}')
    keywords = keyword_response.json()
    extracted_options = extract_values(keywords)

    clean_options = sorted(list(set([
        v for v in extracted_options if v != 'NOT APPLICABLE'
    ])))

    return clean_options


def extract_values(data, keys_to_extract=["value"]):
    """
    Recursively extracts string values associated with specific keys
    (defaulting to "value") from a nested dictionary or list structure.

    Args:
        data (dict | list): The nested data structure (JSON object/array).
        keys_to_extract (list): The list of keys whose values should be extracted.

    Returns:
        list: A flat list containing all extracted values.
    """
    extracted_list = []

    if isinstance(data, dict):
        for key, value in data.items():
            if key in keys_to_extract and isinstance(value, str):
                extracted_list.append(value)

            if isinstance(value, (dict, list)):
                extracted_list.extend(extract_values(value, keys_to_extract))

    elif isinstance(data, list):
        for item in data:
            if isinstance(item, (dict, list)):
                extracted_list.extend(extract_values(item, keys_to_extract))

    return extracted_list


def remove_csrf_tokens(data: dict | list) -> dict | list:
    if isinstance(data, dict):
        cleaned_dict = {}
        for key, value in data.items():
            if key == 'csrf_token':
                continue

            cleaned_dict[key] = remove_csrf_tokens(value)
        return cleaned_dict

    elif isinstance(data, list):
        return [remove_csrf_tokens(item) for item in data]

    else:
        return data


def get_orcid_info(orcid_id: str) -> dict:
    """
    Fetches basic ORCID profile data using NRF API.
    """
    base_url = config.ORCID.BASE_URL.rstrip("/")
    url = f"{base_url}/v1.0/Integration/Orcid/GetBasicProfile/{orcid_id}"

    headers = {
        "X-Api-Key": config.ORCID.API_KEY,
        "Accept": "application/json"
    }

    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()

    data = response.json()

    if data.get("success"):
        return data["responseResult"]
    else:
        error_msg = data.get("errorMessage") or "ORCID lookup failed"
        raise Exception(f"API Error: {error_msg}")


def clean_submission_data(submission_form_data: dict) -> dict:
    data = dict(submission_form_data)

    # Dates need to be serialised
    data['date_range']['start_date'] = str(submission_form_data['date_range']['start_date'])
    data['date_range']['end_date'] = str(submission_form_data['date_range']['end_date'])
    if 'publication_year' in data:
        data['publication_year'] = str(submission_form_data['publication_year'])

    cleaned_data = remove_csrf_tokens(data)

    return cleaned_data
