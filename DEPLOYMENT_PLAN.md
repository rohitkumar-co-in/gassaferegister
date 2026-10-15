# Private feasibility test

Prepared 15 October 2026 (Asia/Calcutta). No cloud build or run has been started for this project.

## Local verification

- TypeScript compilation passed.
- Six unit tests passed (five probe tests and one template test).
- Input, dataset, and key-value store schema validation passed.
- Default offline Actor run passed and wrote one clearly labelled synthetic business.
- Offline summary: zero network requests.
- npm audit after dependency fixes: zero reported vulnerabilities.
- Docker image tag verified in the official Apify Docker Hub repository; Docker is not available locally, so the image build remains untested.

## Account observations

CLI authenticated as leadomi. Read-only account lookup reported current-cycle usage approximately USD 2.50 and a configured maximum monthly usage of USD 85. A maximum is not an included-credit balance. Residential proxy service is enabled; UK exit availability has not been tested. Account rates reported USD 8/GB residential traffic and USD 0.20/compute unit.

## Proposed next test

1. Rotate the proxy password exposed accidentally in a tool response. Do not put the replacement in the repository or chat.
2. Deploy once as a private Actor, after confirming deployment and the test spending budget.
3. Verify the built Actor is private and set conservative default run options.
4. Run one Cambridge Domestic search with UK residential proxy, 1024 MB memory, platform timeout 120 seconds, browser timeout 90 seconds, maximum 80 attempted network requests, and no retry.
5. Read status and RUN-SUMMARY; retrieve output only if the source results were parsed successfully.
6. Inspect build/run charges and proxy usage. Stop after this single trial regardless of success; never automatically launch more attempts.

Suggested initial spending target: USD 0.25 including build and probe. This is a target, not a guaranteed billing cap: accounting can lag, proxy traffic is billed independently, and request limits are not byte limits. Do not change the account-wide monthly limit.

## Remaining implementation

The access probe is not the full requested scraper. Town disambiguation, postcode validation against the source, pagination behavior, engineer and qualification extraction, registration lookup, restart checkpoints, business deduplication across locations, and production reliability checks remain. Implement and benchmark these after access is proven. Do not publish or advertise enterprise readiness before those steps pass.

## Cloud test result — 15 October 2026

Deployment completed as private Actor 7tSEDg7eo5c6gxyFL, build 0.0.27. The first build failed on an implicit working-directory assumption; Dockerfile now sets its directory explicitly. One unintended cloud offline run occurred because the Windows command wrapper split URL query parameters. It made zero source/proxy requests. Subsequent API calls use the CLI JavaScript entry point directly.

The actual Cambridge Domestic probe used UK residential proxy, 1024 MB memory, 120-second platform timeout, 90-second browser timer, and an 80-request ceiling. It failed with SOURCE_BLOCKED after four network requests, returning zero businesses. No further source attempts were launched. See CLOUD_TEST_RESULT.json for itemized charges; total reported usage was approximately USD 0.022, subject to billing finalization.

Do not increase crawl volume to address this block. The next technical step is inspecting the failure diagnostic and deciding on one separately budgeted access experiment or a permitted data-access route. Engineer extraction and pagination remain unverified.
