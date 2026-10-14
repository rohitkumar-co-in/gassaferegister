# Gas Safe Register UK Scraper (Apify Actor)

Cost-effective, stealth Apify Actor for scraping gas engineering businesses, contact details, certified engineers, and appliance qualification matrices from the official UK **[Gas Safe Register](https://www.gassaferegister.co.uk/)**.

---

## Features

- **Single City / Postcode Search**: Simply enter any UK city name (e.g. `Leeds`, `Manchester`, `Bristol`) or full postcode (e.g. `SW1A 1AA`, `B1 1AA`).
- **Comprehensive Business Leads**: Extracts company trading name, registration number, telephone numbers (formatted and raw), email addresses, detailed address breakdown, out-of-hours service availability, and distance.
- **Engineer & Qualification Enrichment**: Optionally visits business profiles to collect individual gas engineers (name, services, phone, active status) and appliance qualification matrices (Domestic/Commercial, Natural Gas, LPG, Building Regulations).
- **Anti-Bot & Geo-Bypass**: Pre-configured with UK Residential Proxy and stealth browser fingerprints to seamlessly navigate Imperva Incapsula challenges.
- **Credit-Saving Cost Optimizations**:
  - Automatically aborts heavy images, fonts, tracking scripts, and media streams, slashing residential proxy bandwidth by **>85%**.
  - Reuses sticky proxy sessions across detail visits to avoid repeated security checks.
  - Conservative default page limits (`maxPages: 2`, `engineerPagesPerBusiness: 2`) to ensure runs stay well within the Apify Creator/Developer credit budget.

---

## Input Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `location` | String | `"Leeds"` | UK town/city name or postcode to search. |
| `serviceType` | String | `"Domestic"` | Filter by `"Domestic"` or `"Commercial"`. |
| `maxPages` | Integer | `2` | Number of business result pages to scrape (low limits save credits). |
| `includeEngineers` | Boolean | `true` | When true, enriches each business with engineer names and qualification tables. |
| `engineerPagesPerBusiness` | Integer | `2` | Max engineer sub-pages per business. |
| `proxyConfiguration` | Object | `{"useApifyProxy": true, "apifyProxyGroups": ["RESIDENTIAL"], "apifyProxyCountry": "GB"}` | Apify Proxy configuration (UK Residential recommended). |

---

## Output Data Structure

The Actor pushes structured records to the default Apify Dataset, easily exportable to **JSON**, **CSV**, **Excel**, or webhooks:

```json
{
  "business_name": "ABC Heating & Gas Ltd",
  "registration_number": "123456",
  "telephone": "0113 123 4567",
  "telephone_normalized": "01131234567",
  "email": "info@abcheating.co.uk",
  "address": {
    "premise": "Unit 4",
    "street": "High Street",
    "town": "Leeds",
    "county": "West Yorkshire",
    "postcode": "LS1 1AA",
    "full_address": "Unit 4, High Street, Leeds, West Yorkshire, LS1 1AA"
  },
  "postcode": "LS1 1AA",
  "out_of_hours_available": true,
  "distance_miles": "1.2",
  "search_location": "Leeds",
  "service_type": "Domestic",
  "collected_at": "2026-10-14T15:00:00.000Z",
  "engineers_total_collected": 2,
  "engineers": [
    {
      "name": "John Doe",
      "telephone": "07123456789",
      "status": "Active",
      "services": ["Boiler installation", "Cooker repair"]
    }
  ],
  "qualifications": [
    {
      "name": "Combustion Analysis",
      "service_type": "Domestic",
      "natural_gas": true,
      "lpg": false,
      "building_regulations": true
    }
  ]
}
```

---

## Credit Optimization Tips for Creator Plan

1. **Keep `maxPages` focused**: Setting `maxPages: 2` typically yields ~20-50 high-quality local leads per city without burning proxy bandwidth.
2. **Toggle `includeEngineers`**: If you only need company names, phone numbers, and addresses for outbound lead generation, turn `includeEngineers: false`. This skips all sub-page requests and cuts run time and credit consumption by ~70%!
