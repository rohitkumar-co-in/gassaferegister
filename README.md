# Gas Safe Register UK Scraper (Parse.bot Parity)

Stealth, cost-effective Apify Actor replicating the exact functionality and data contracts of the **[Parse.bot Gas Safe Register UK API](https://parse.bot/marketplace/78e68814-3355-4cdb-ab2e-3285650b1142/gassaferegister-co-uk-api)**.

---

## Supported Modes & Endpoints

This Actor supports both search workflows from Parse.bot in a single Actor:

### 1. `search_businesses` & `search_businesses_basic`
* Search by UK city or postcode (e.g. `Cambridge`, `Leeds`, `CB1 1JY`).
* Filter by `service_type`: `Domestic` or `Commercial`.
* Pagination: `page` (start page) and `max_pages` (1-25 consecutive pages).
* Toggle `include_engineers`:
  * `true` (`search_businesses`): Visits each business to extract all registered gas engineers with their names, services, telephone, and active status.
  * `false` (`search_businesses_basic`): Fast, lightweight listing without sub-page visits to conserve credits.

### 2. `get_business_engineers`
* Provide a `registration_number` (e.g. `664901`).
* Directly looks up that specific business and returns the company record alongside all registered engineers.

---

## Input Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `location` | String | `"Cambridge"` | UK town/city name or postcode to search. |
| `registration_number` | String | `null` | Optional direct lookup by Gas Safe registration number. |
| `service_type` | String | `"Domestic"` | `"Domestic"` or `"Commercial"`. |
| `page` | Integer | `1` | First listing page to read (1-indexed). |
| `max_pages` | Integer | `1` | Number of consecutive pages to combine (1-25). |
| `include_engineers` | Boolean | `true` | Fetch registered engineers with photos, licence IDs, and contact info. |
| `include_services` | Boolean | `false` | Fetch complete Domestic & Commercial competencies matrix (Natural Gas, LPG, Building Regs). |
| `proxyConfiguration` | Object | UK Residential | Pre-configured Apify UK Residential Proxy. |

---

## Output Data Structure (1:1 Parse.bot Parity + Enriched Competencies)

### Dataset Records (Individual Business Object)
```json
{
  "business_name": "Yellow Rose Property Services",
  "trading_name": null,
  "registration_number": "634956",
  "telephone": "07346011559",
  "email": "info@yellowrosepropertyservices.co.uk",
  "address": {
    "premise": "BARN MEAD",
    "street": "CHURCH STREET",
    "town": "HUNTINGDON",
    "county": "CAMBRIDGESHIRE",
    "postcode": "PE28 2QE",
    "full_address": "BARN MEAD, CHURCH STREET, HUNTINGDON, CAMBRIDGESHIRE, PE28 2QE"
  },
  "distance_miles": "",
  "out_of_hours_available": true,
  "engineers": [
    {
      "name": "Stefan Brand",
      "licence_number": "508103",
      "services": ["Domestic"],
      "telephone": null,
      "status": "Registered",
      "photo_url": "https://www.gassaferegister.co.uk/photo/3ec2ade8-966f-ec11-8943-000d3a86c5c3/508103",
      "competencies_url": "https://www.gassaferegister.co.uk/engineerabcompetencies/5960166?ep=..."
    }
  ],
  "services_matrix": {
    "domestic": [
      {
        "service": "Combustion performance gas analysis",
        "natural_gas": true,
        "lpg": true,
        "building_regulations": false
      },
      {
        "service": "Gas Boiler",
        "natural_gas": true,
        "lpg": true,
        "building_regulations": false
      },
      {
        "service": "Unvented Hot Water storage Cylinders (G3)",
        "natural_gas": false,
        "lpg": false,
        "building_regulations": true
      }
    ],
    "commercial": []
  }
}
```

### Key-Value Store `OUTPUT` (Full Response Envelope)
```json
{
  "status": "success",
  "data": {
    "page": 1,
    "last_page": 1,
    "max_pages": 1,
    "pages_fetched": 1,
    "location": "Cambridge",
    "service_type": "Domestic",
    "total_results": 50,
    "total_pages": 5,
    "results_on_page": 10,
    "has_more": true,
    "businesses": [ ... ]
  }
}
```

---

## Anti-Bot & Credit Optimization
* **Imperva Incapsula Bypass**: Runs with stealth Chromium through Apify UK Residential Proxy with sticky sessions.
* **Asset Aborting**: Blocks images, fonts, tracking scripts, and media streams, slashing proxy bandwidth by **>85%**.
