export interface PropertyCandidate {
  readonly kind: string;
  readonly externalId: string;
  readonly name: string;
}

export interface DailyMetric {
  readonly metric: string;
  readonly date: string;
  readonly value: number;
  readonly dimensions: Readonly<Record<string, string>>;
}

const BUSINESS_ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFORMATION = "https://mybusinessbusinessinformation.googleapis.com/v1";
const BUSINESS_PERFORMANCE = "https://businessprofileperformance.googleapis.com/v1";
const SEARCH_CONSOLE = "https://searchconsole.googleapis.com/webmasters/v3";

// Metrics the priority cards need: how often the listing surfaced and how often
// someone acted on it.
const DAILY_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS"
] as const;

export async function listBusinessLocations(accessToken: string): Promise<PropertyCandidate[]> {
  const accounts = await getJson<{ readonly accounts?: readonly { readonly name?: string }[] }>(
    `${BUSINESS_ACCOUNTS}/accounts`,
    accessToken
  );

  const candidates: PropertyCandidate[] = [];
  for (const account of accounts.accounts ?? []) {
    if (account.name === undefined) continue;
    const locations = await getJson<{
      readonly locations?: readonly { readonly name?: string; readonly title?: string }[];
    }>(
      `${BUSINESS_INFORMATION}/${account.name}/locations?readMask=name,title&pageSize=100`,
      accessToken
    );
    for (const location of locations.locations ?? []) {
      if (location.name === undefined) continue;
      candidates.push({
        kind: "location",
        // The performance API addresses a location as accounts/x/locations/y, so the
        // account prefix has to survive in the stored identifier.
        externalId: `${account.name}/${location.name}`,
        name: location.title ?? location.name
      });
    }
  }
  return candidates;
}

export async function listSearchConsoleSites(accessToken: string): Promise<PropertyCandidate[]> {
  const body = await getJson<{
    readonly siteEntry?: readonly {
      readonly siteUrl?: string;
      readonly permissionLevel?: string;
    }[];
  }>(`${SEARCH_CONSOLE}/sites`, accessToken);

  const candidates: PropertyCandidate[] = [];
  for (const entry of body.siteEntry ?? []) {
    if (entry.siteUrl === undefined || entry.permissionLevel === "siteUnverifiedUser") continue;
    candidates.push({ kind: "site", externalId: entry.siteUrl, name: entry.siteUrl });
  }
  return candidates;
}

export async function fetchBusinessPerformance(input: {
  readonly accessToken: string;
  readonly externalId: string;
  readonly start: Date;
  readonly end: Date;
}): Promise<DailyMetric[]> {
  const location = input.externalId.slice(input.externalId.indexOf("locations/"));
  const url = new URL(`${BUSINESS_PERFORMANCE}/${location}:fetchMultiDailyMetricsTimeSeries`);
  for (const metric of DAILY_METRICS) {
    url.searchParams.append("dailyMetrics", metric);
  }
  appendDate(url, "dailyRange.start_date", input.start);
  appendDate(url, "dailyRange.end_date", input.end);

  const body = await getJson<MultiDailyMetricsResponse>(url.toString(), input.accessToken);
  return flattenDailyMetrics(body, location);
}

function flattenDailyMetrics(body: MultiDailyMetricsResponse, location: string): DailyMetric[] {
  return (body.multiDailyMetricTimeSeries ?? [])
    .flatMap((series) => series.dailyMetricTimeSeries ?? [])
    .flatMap((entry) => seriesToMetrics(entry, location));
}

function seriesToMetrics(entry: DailyMetricSeries, location: string): readonly DailyMetric[] {
  const metric = entry.dailyMetric;
  if (metric === undefined) return [];
  const metrics: DailyMetric[] = [];
  for (const point of entry.timeSeries?.datedValues ?? []) {
    const date = toIsoDate(point.date);
    // A day with no activity omits the value rather than reporting zero.
    if (date !== null) {
      metrics.push({ metric, date, value: Number(point.value ?? 0), dimensions: { location } });
    }
  }
  return metrics;
}

/**
 * Site-wide daily totals answer "is traffic up or down" but never "which query
 * should we act on", so callers can request the query and page breakdown too.
 * Search Console returns only the top rows for a breakdown — never present the
 * result as a complete picture.
 */
export async function querySearchAnalytics(input: {
  readonly accessToken: string;
  readonly siteUrl: string;
  readonly start: Date;
  readonly end: Date;
  readonly dimensions?: readonly string[];
  readonly rowLimit?: number;
}): Promise<DailyMetric[]> {
  const dimensions_ = input.dimensions ?? ["date"];
  if (dimensions_[0] !== "date") {
    throw new Error("Search Console breakdowns must start with the date dimension.");
  }

  const response = await fetch(
    `${SEARCH_CONSOLE}/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        startDate: isoDate(input.start),
        endDate: isoDate(input.end),
        dimensions: dimensions_,
        rowLimit: input.rowLimit ?? 5000
      })
    }
  );
  if (!response.ok) {
    throw new Error(`Search Console query failed with status ${response.status.toString()}`);
  }

  const body = (await response.json()) as SearchAnalyticsResponse;
  return (body.rows ?? []).flatMap((row) => searchRowToMetrics(row, input.siteUrl, dimensions_));
}

interface SearchAnalyticsRow {
  readonly keys?: readonly string[];
  readonly clicks?: number;
  readonly impressions?: number;
  readonly ctr?: number;
  readonly position?: number;
}

interface SearchAnalyticsResponse {
  readonly rows?: readonly SearchAnalyticsRow[];
}

/**
 * The keys after "date" line up positionally with the dimensions requested, so a
 * breakdown lands in the same dimensions object the daily totals already use.
 */
function rowDimensions(
  keys: readonly string[],
  siteUrl: string,
  requested: readonly string[]
): Readonly<Record<string, string>> {
  const dimensions: Record<string, string> = { site: siteUrl };
  for (let index = 1; index < requested.length; index += 1) {
    const name = requested[index];
    const value = keys[index];
    if (name !== undefined && value !== undefined) dimensions[name] = value;
  }
  return dimensions;
}

function searchRowToMetrics(
  row: SearchAnalyticsRow,
  siteUrl: string,
  requested: readonly string[]
): readonly DailyMetric[] {
  const date = row.keys?.[0];
  if (date === undefined) return [];

  const dimensions = rowDimensions(row.keys ?? [], siteUrl, requested);
  return [
    { metric: "SEARCH_CLICKS", date, value: row.clicks ?? 0, dimensions },
    { metric: "SEARCH_IMPRESSIONS", date, value: row.impressions ?? 0, dimensions },
    { metric: "SEARCH_CTR", date, value: row.ctr ?? 0, dimensions },
    { metric: "SEARCH_POSITION", date, value: row.position ?? 0, dimensions }
  ];
}

const BUSINESS_REVIEWS = "https://mybusiness.googleapis.com/v4";
const MAX_REVIEW_PAGES = 5;

const STAR_RATING: Readonly<Record<string, number>> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5
};

export interface ReviewRecord {
  /** Full resource name, e.g. accounts/x/locations/y/reviews/z. */
  readonly externalId: string;
  readonly authorName: string | null;
  readonly rating: number;
  readonly body: string | null;
  readonly publishedAt: string;
  readonly updatedAt: string | null;
  readonly hasReply: boolean;
}

interface RawReview {
  readonly name?: string;
  readonly reviewer?: { readonly displayName?: string; readonly isAnonymous?: boolean };
  readonly starRating?: string;
  readonly comment?: string;
  readonly createTime?: string;
  readonly updateTime?: string;
  readonly reviewReply?: { readonly comment?: string };
}

interface ReviewsListResponse {
  readonly reviews?: readonly RawReview[];
  readonly nextPageToken?: string;
}

/**
 * The legacy v4 Business Profile Reviews endpoints require separate Google
 * allow-listing from the Performance/Information APIs already used elsewhere in
 * this adapter — this call is correct but may need that approval before it
 * returns real data in production, independent of anything in this codebase.
 */
function reviewAuthorName(review: RawReview): string | null {
  if (review.reviewer?.isAnonymous === true) return null;
  return review.reviewer?.displayName ?? null;
}

function toReviewRecord(review: RawReview): ReviewRecord | null {
  if (review.name === undefined || review.createTime === undefined) return null;
  return {
    externalId: review.name,
    authorName: reviewAuthorName(review),
    rating: STAR_RATING[review.starRating ?? ""] ?? 0,
    body: review.comment ?? null,
    publishedAt: review.createTime,
    updatedAt: review.updateTime ?? null,
    hasReply: review.reviewReply !== undefined
  };
}

export async function fetchReviews(input: {
  readonly accessToken: string;
  /** accounts/x/locations/y, as stored on the selected integration property. */
  readonly locationExternalId: string;
}): Promise<ReviewRecord[]> {
  const records: ReviewRecord[] = [];
  let pageToken: string | undefined;
  let page = 0;

  do {
    const url = new URL(`${BUSINESS_REVIEWS}/${input.locationExternalId}/reviews`);
    url.searchParams.set("pageSize", "50");
    if (pageToken !== undefined) url.searchParams.set("pageToken", pageToken);

    const body = await getJson<ReviewsListResponse>(url.toString(), input.accessToken);
    for (const review of body.reviews ?? []) {
      const record = toReviewRecord(review);
      if (record !== null) records.push(record);
    }
    pageToken = body.nextPageToken;
    page += 1;
  } while (pageToken !== undefined && page < MAX_REVIEW_PAGES);

  return records;
}

export async function replyToReview(input: {
  readonly accessToken: string;
  /** Full resource name of the review, as stored on app.reviews.external_id. */
  readonly reviewExternalId: string;
  readonly comment: string;
}): Promise<void> {
  const response = await fetch(`${BUSINESS_REVIEWS}/${input.reviewExternalId}/reply`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ comment: input.comment })
  });
  if (!response.ok) {
    throw new Error(`Google review reply failed with status ${response.status.toString()}`);
  }
}

interface GoogleDate {
  readonly year?: number;
  readonly month?: number;
  readonly day?: number;
}

interface DailyMetricSeries {
  readonly dailyMetric?: string;
  readonly timeSeries?: {
    readonly datedValues?: readonly { readonly date?: GoogleDate; readonly value?: string }[];
  };
}

interface MultiDailyMetricsResponse {
  readonly multiDailyMetricTimeSeries?: readonly {
    readonly dailyMetricTimeSeries?: readonly DailyMetricSeries[];
  }[];
}

async function getJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Google request to ${url} failed with status ${response.status.toString()}`);
  }
  return (await response.json()) as T;
}

function appendDate(url: URL, prefix: string, value: Date): void {
  url.searchParams.set(`${prefix}.year`, String(value.getUTCFullYear()));
  url.searchParams.set(`${prefix}.month`, String(value.getUTCMonth() + 1));
  url.searchParams.set(`${prefix}.day`, String(value.getUTCDate()));
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toIsoDate(value: GoogleDate | undefined): string | null {
  if (value?.year === undefined || value.month === undefined || value.day === undefined) {
    return null;
  }
  const month = String(value.month).padStart(2, "0");
  const day = String(value.day).padStart(2, "0");
  return `${String(value.year)}-${month}-${day}`;
}
