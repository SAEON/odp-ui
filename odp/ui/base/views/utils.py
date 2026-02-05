import requests

from odp.config import config

KEYWORDS_URL = 'https://cmr.earthdata.nasa.gov/search/keywords/'


def populate_keywords_choices(field):
    field.choices = get_keywords('science_keywords')


def populate_instruments_choices(field):
    field.choices = get_keywords('instruments')


def get_keywords(keyword_type):
    keyword_response = requests.get(f'{KEYWORDS_URL}{keyword_type}')
    keywords = keyword_response.json()
    extracted_options = extract_values(keywords)

    clean_options = sorted(list(set([
        v for v in extracted_options if v != 'NOT APPLICABLE'
    ])), key=lambda x: x[1])

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


def get_orcid_info(orcid_id: str):
    url = f'{config.ORCID.BASE_URL}oauth/token'

    payload = {
        'client_id': config.ORCID.CLIENT_ID,
        'client_secret': config.ORCID.CLIENT_SECRET,
        'grant_type': 'client_credentials',
        'scope': '/read-public'
    }

    headers = {
        'Accept': 'application/json'
    }

    response = requests.post(url, data=payload, headers=headers)
    response.raise_for_status()
    token_data = response.json()
    access_token = token_data.get('access_token')

    return get_orcid_record(orcid_id, access_token)


def get_orcid_record(orcid_id: str, bearer_token: str):
    url = f"{config.ORCID.BASE_URL}v2.1/{orcid_id}/record"

    headers = {
        'Authorization': f'Bearer {bearer_token}',
        'Accept': 'application/vnd.orcid+json'
    }

    response = requests.get(url, headers=headers)
    response.raise_for_status()

    return response.json()


def clean_submission_data(submission_form_data: dict) -> dict:
    data = dict(submission_form_data)
    data['date_range']['start_date'] = str(submission_form_data['date_range']['start_date'])
    data['date_range']['end_date'] = str(submission_form_data['date_range']['end_date'])

    cleaned_data = remove_csrf_tokens(data)

    return cleaned_data
