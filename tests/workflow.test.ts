import { describe, it, expect, vi } from 'vitest';
import { handleRunSeoAuditWorkflow } from '../src/tools/workflow.js';
import type { SearchConsoleService } from '../src/service.js';
import type { ToolResult } from '../src/utils/types.js';

function parseResult(result: ToolResult): Record<string, unknown> {
  return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
}

describe('run_seo_audit_workflow', () => {
  it('returns shared report payload plus markdown and html output when reportFormat=all', async () => {
    const service = {
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      searchAnalytics: vi.fn().mockResolvedValue({
        data: {
          rows: [{ keys: ['https://example.com/a'], clicks: 100, impressions: 1000, ctr: 0.1, position: 4 }],
        },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.8 }, seo: { score: 0.9 } } } },
      }),
      cruxQueryRecord: vi.fn().mockRejectedValue(new Error('No CrUX data')),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      profile: 'technical',
      urls: ['https://example.com/a'],
      reportFormat: 'all',
      reportPack: 'technical_audit',
      detailMode: 'analyst',
      brand: {
        name: 'Nth Agency',
        logoUrl: 'https://example.com/logo.png',
        accentColor: '#0F172A',
      },
    });

    const payload = parseResult(result);
    expect(payload.profile).toBe('technical');
    expect((payload.steps as Array<unknown>).length).toBeGreaterThan(1);
    expect(typeof payload.markdownReport).toBe('string');
    expect(typeof payload.htmlReport).toBe('string');
    expect(payload.reportFormat).toBe('all');
    expect(payload.detailMode).toBe('analyst');
    expect(payload.reportPack).toBe('technical_audit');
    expect(payload.brand).toEqual({
      name: 'Nth Agency',
      logoUrl: 'https://example.com/logo.png',
      accentColor: '#0F172A',
    });
    expect(payload.report).toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          title: 'Technical SEO Workflow Report',
          format: 'all',
          detailMode: 'analyst',
          reportPack: 'technical_audit',
          brand: {
            name: 'Nth Agency',
            logoUrl: 'https://example.com/logo.png',
            accentColor: '#0F172A',
          },
        }),
        site: expect.objectContaining({
          siteUrl: 'sc-domain:example.com',
          profile: 'technical',
        }),
        pack: expect.objectContaining({
          name: 'technical_audit',
          headline: 'Technical audit pack',
          cadence: 'ad_hoc',
          primaryAudience: 'both',
        }),
        audience: expect.objectContaining({
          detailMode: 'analyst',
        }),
      }),
    );
    expect(payload.issues).toEqual(expect.any(Array));
    expect(payload.actions).toEqual(expect.any(Array));
    expect(payload.clientSummary).toEqual(expect.any(Array));
    expect(payload.analystSummary).toBeUndefined();
    expect(String(payload.htmlReport)).toContain('<!DOCTYPE html>');
    expect(String(payload.htmlReport)).toContain('Nth Agency');
    expect(String(payload.htmlReport)).toContain('#0F172A');
    expect(String(payload.htmlReport)).toContain('Technical audit pack');
    expect(String(payload.htmlReport)).toContain('Prioritized Actions');
    expect(String(payload.markdownReport)).toContain('## Actions');
    expect((payload.executiveSummary as Record<string, unknown>).stepsSucceeded).toBeGreaterThan(0);
  });

  it('renders monthly SEO pack as a client-facing report with performance sections', async () => {
    const searchAnalytics = vi.fn().mockImplementation(async (_siteUrl: string, body: Record<string, unknown>) => {
      const dimensions = (body.dimensions as string[] | undefined) ?? [];
      const startDate = String(body.startDate ?? '');

      if (dimensions.join(',') === 'query,page') {
        return {
          data: {
            rows: [
              {
                keys: ['vertex seo package', 'https://example.com/services/seo'],
                clicks: 20,
                impressions: 300,
                ctr: 0.0667,
                position: 6.2,
              },
            ],
          },
        };
      }

      if (dimensions.join(',') === 'date') {
        return startDate === '2026-03-01'
          ? {
              data: {
                rows: [
                  { keys: ['2026-03-01'], clicks: 60, impressions: 800, ctr: 0.075, position: 8 },
                  { keys: ['2026-03-15'], clicks: 90, impressions: 1200, ctr: 0.075, position: 7.2 },
                ],
              },
            }
          : {
              data: {
                rows: [
                  { keys: ['2026-02-01'], clicks: 40, impressions: 650, ctr: 0.0615, position: 9.3 },
                  { keys: ['2026-02-15'], clicks: 55, impressions: 900, ctr: 0.0611, position: 8.8 },
                ],
              },
            };
      }

      if (dimensions.join(',') === 'query') {
        return startDate === '2026-03-01'
          ? {
              data: {
                rows: [
                  { keys: ['vertex seo package'], clicks: 50, impressions: 500, ctr: 0.1, position: 5.8 },
                  { keys: ['seo retainer uk'], clicks: 35, impressions: 420, ctr: 0.0833, position: 7.1 },
                  { keys: ['digital marketing middlesbrough'], clicks: 22, impressions: 280, ctr: 0.0785, position: 8.4 },
                ],
              },
            }
          : {
              data: {
                rows: [
                  { keys: ['vertex seo package'], clicks: 30, impressions: 360, ctr: 0.0833, position: 7.2 },
                  { keys: ['seo retainer uk'], clicks: 18, impressions: 300, ctr: 0.06, position: 8.1 },
                  { keys: ['digital marketing middlesbrough'], clicks: 24, impressions: 290, ctr: 0.0828, position: 8.1 },
                ],
              },
            };
      }

      if (dimensions.join(',') === 'page') {
        // `detect_content_decay` splits the explicit range into recent/prior halves, so the page
        // mock needs to treat February as the "recent" branch for that step even though the
        // monthly report enrichment later fetches current-period page rows from March.
        return startDate === '2026-02-01'
          ? {
              data: {
                rows: [
                  { keys: ['https://example.com/services/seo'], clicks: 32, impressions: 420, ctr: 0.0762, position: 7.8 },
                  { keys: ['https://example.com/insights/seo'], clicks: 16, impressions: 250, ctr: 0.064, position: 9.5 },
                ],
              },
            }
          : {
              data: {
                rows: [
                  { keys: ['https://example.com/services/seo'], clicks: 48, impressions: 540, ctr: 0.0889, position: 6.4 },
                  { keys: ['https://example.com/insights/seo'], clicks: 25, impressions: 290, ctr: 0.0862, position: 8.2 },
                ],
              },
            };
      }

      return { data: { rows: [] } };
    });

    const service = {
      searchAnalytics,
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      startDate: '2026-03-01',
      endDate: '2026-03-28',
      profile: 'content',
      reportPack: 'monthly_seo',
      reportFormat: 'all',
      detailMode: 'both',
      brand: {
        name: 'Nth Agency',
        accentColor: '#0F172A',
      },
    });

    const payload = parseResult(result);
    const report = payload.report as Record<string, unknown>;
    const monthlySeo = (report.sections as Record<string, unknown>).monthlySeo as Record<string, unknown>;
    const kpiSummary = monthlySeo.kpiSummary as Array<Record<string, unknown>>;
    const summary = monthlySeo.summary as Record<string, unknown>;
    const whatImproved = (summary.whatImproved as Array<string | undefined> | undefined) ?? [];
    const doingNext = (summary.doingNext as Array<string | undefined> | undefined) ?? [];
    const requestBodies = searchAnalytics.mock.calls.map(([, body]) => body as Record<string, unknown>);
    const dateBodies = requestBodies.filter((body) => Array.isArray(body.dimensions) && body.dimensions.join(',') === 'date');

    expect(report.pack).toEqual(
      expect.objectContaining({
        name: 'monthly_seo',
        headline: 'Monthly SEO update pack',
        cadence: 'monthly',
        primaryAudience: 'client',
      }),
    );
    expect(kpiSummary).toEqual(expect.any(Array));
    expect(kpiSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Average Position',
          delta: -1.5,
          direction: 'down',
        }),
      ]),
    );
    expect(summary).toEqual(
      expect.objectContaining({
        headline: 'Organic search moved in the right direction this month, with stronger visibility and no major declines.',
        whatImproved: expect.any(Array),
        needsAttention: expect.any(Array),
        doingNext: expect.any(Array),
      }),
    );
    expect(whatImproved).toEqual(
      expect.arrayContaining([expect.stringContaining('vertex seo package')]),
    );
    expect(doingNext).toEqual(
      expect.arrayContaining([expect.stringMatching(/Agency action|Shared follow-up/)]),
    );
    expect(monthlySeo.popularSearches).toEqual(expect.objectContaining({ topQueries: expect.any(Array) }));
    expect(monthlySeo.topPages).toEqual(expect.objectContaining({ topPages: expect.any(Array) }));
    expect(monthlySeo.brandPerformance).toEqual(expect.any(Array));
    expect(monthlySeo.nextMonthPriorities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: expect.any(String),
          ownerLabel: expect.stringMatching(/Agency action|Shared follow-up/),
        }),
      ]),
    );
    expect(dateBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          startDate: '2026-03-01',
          endDate: '2026-03-28',
          rowLimit: 28,
        }),
        expect.objectContaining({
          startDate: '2026-02-01',
          endDate: '2026-02-28',
          rowLimit: 28,
        }),
      ]),
    );
    expect(String(payload.markdownReport)).toContain('## TL;DR');
    expect(String(payload.markdownReport)).toContain("### What We're Doing Next");
    expect(String(payload.markdownReport)).toContain(
      'No immediate problem areas stood out in the monthly comparison.',
    );
    expect(String(payload.markdownReport)).toContain('## KPI Summary');
    expect(String(payload.markdownReport)).toContain('## Popular Searches');
    expect(String(payload.markdownReport)).toContain('## Brand vs Non-Brand Performance');
    expect(String(payload.markdownReport)).toContain('## Analyst Appendix');
    expect(String(payload.htmlReport)).toContain('TL;DR');
    expect(String(payload.htmlReport)).toContain("What we're doing next");
    expect(String(payload.htmlReport)).toContain(
      'Organic search moved in the right direction this month, with stronger visibility and no major declines.',
    );
    expect(String(payload.htmlReport)).toContain('Month-over-Month Summary');
    expect(String(payload.htmlReport)).toContain('Popular Searches');
    expect(String(payload.htmlReport)).toContain('Top Pages');
    expect(String(payload.htmlReport)).toContain('Next Month Priorities');
    expect(String(payload.htmlReport)).toContain('Analyst Appendix');
    expect(String(payload.htmlReport)).toMatch(/Agency action|Shared follow-up/);
    expect(String(payload.markdownReport)).toContain('clicksDelta=');
    expect(String(payload.htmlReport)).toContain('<th>Impr. Δ</th>');
    expect(String(payload.htmlReport)).toContain('<th>Segment</th>');
    expect(String(payload.htmlReport)).not.toContain('Prioritized Actions');
  });

  it('filters visibility-only rows out of monthly wins and rising sections', async () => {
    const searchAnalytics = vi.fn().mockImplementation(async (_siteUrl: string, body: Record<string, unknown>) => {
      const dimensions = (body.dimensions as string[] | undefined) ?? [];
      const startDate = String(body.startDate ?? '');

      if (dimensions.join(',') === 'query,page') {
        return {
          data: {
            rows: [
              {
                keys: ['real growth query', 'https://example.com/services/seo'],
                clicks: 18,
                impressions: 420,
                ctr: 0.0429,
                position: 5.2,
              },
              {
                keys: ['visibility only query', 'https://example.com/guides/visibility'],
                clicks: 0,
                impressions: 1200,
                ctr: 0,
                position: 6.1,
              },
            ],
          },
        };
      }

      if (dimensions.join(',') === 'date') {
        return startDate === '2026-03-01'
          ? {
              data: {
                rows: [
                  { keys: ['2026-03-01'], clicks: 55, impressions: 900, ctr: 0.0611, position: 7.1 },
                  { keys: ['2026-03-15'], clicks: 78, impressions: 1260, ctr: 0.0619, position: 6.4 },
                ],
              },
            }
          : {
              data: {
                rows: [
                  { keys: ['2026-02-01'], clicks: 40, impressions: 760, ctr: 0.0526, position: 8.8 },
                  { keys: ['2026-02-15'], clicks: 45, impressions: 810, ctr: 0.0556, position: 8.2 },
                ],
              },
            };
      }

      if (dimensions.join(',') === 'query') {
        return startDate === '2026-03-01'
          ? {
              data: {
                rows: [
                  { keys: ['real growth query'], clicks: 24, impressions: 430, ctr: 0.0558, position: 5.4 },
                  { keys: ['visibility only query'], clicks: 0, impressions: 1200, ctr: 0, position: 6.1 },
                ],
              },
            }
          : {
              data: {
                rows: [
                  { keys: ['real growth query'], clicks: 8, impressions: 260, ctr: 0.0308, position: 8.6 },
                  { keys: ['visibility only query'], clicks: 0, impressions: 140, ctr: 0, position: 11.9 },
                ],
              },
            };
      }

      if (dimensions.join(',') === 'page') {
        return startDate === '2026-03-01'
          ? {
              data: {
                rows: [
                  { keys: ['https://example.com/services/seo'], clicks: 26, impressions: 460, ctr: 0.0565, position: 5.8 },
                  { keys: ['https://example.com/guides/visibility'], clicks: 0, impressions: 980, ctr: 0, position: 6.5 },
                ],
              },
            }
          : {
              data: {
                rows: [
                  { keys: ['https://example.com/services/seo'], clicks: 10, impressions: 280, ctr: 0.0357, position: 8.4 },
                  { keys: ['https://example.com/guides/visibility'], clicks: 0, impressions: 180, ctr: 0, position: 11.3 },
                ],
              },
            };
      }

      return { data: { rows: [] } };
    });

    const service = {
      searchAnalytics,
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.82 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      startDate: '2026-03-01',
      endDate: '2026-03-28',
      profile: 'content',
      reportPack: 'monthly_seo',
      reportFormat: 'all',
      detailMode: 'client',
    });

    const payload = parseResult(result);
    const report = payload.report as Record<string, unknown>;
    const monthlySeo = (report.sections as Record<string, unknown>).monthlySeo as Record<string, unknown>;
    const visibilityQueryLabels = ((monthlySeo.visibilityWins as Record<string, unknown>).queries as Array<Record<string, unknown>>)
      .map((row) => String(row.label));
    const risingQueryLabels = ((monthlySeo.popularSearches as Record<string, unknown>).risingQueries as Array<Record<string, unknown>>)
      .map((row) => String(row.label));
    const visibilityPageLabels = ((monthlySeo.visibilityWins as Record<string, unknown>).pages as Array<Record<string, unknown>>)
      .map((row) => String(row.label));
    const improvingPageLabels = ((monthlySeo.topPages as Record<string, unknown>).improvingPages as Array<Record<string, unknown>>)
      .map((row) => String(row.label));

    expect(visibilityQueryLabels).toContain('real growth query');
    expect(risingQueryLabels).toContain('real growth query');
    expect(visibilityQueryLabels).not.toContain('visibility only query');
    expect(risingQueryLabels).not.toContain('visibility only query');
    expect(visibilityPageLabels).toContain('https://example.com/services/seo');
    expect(improvingPageLabels).toContain('https://example.com/services/seo');
    expect(visibilityPageLabels).not.toContain('https://example.com/guides/visibility');
    expect(improvingPageLabels).not.toContain('https://example.com/guides/visibility');
    expect(String(payload.markdownReport)).toContain(
      'real growth query (Non-branded): 24 clicks this period; +16 clicks, +170 impressions; Position improved 3.2 | CTR 5.58%.',
    );
    expect(String(payload.markdownReport)).not.toContain('clicksDelta=');
    expect(String(payload.markdownReport)).not.toContain('impressionsDelta=');
    expect(String(payload.htmlReport)).toContain('<th>Change</th>');
    expect(String(payload.htmlReport)).toContain('<th>Context</th>');
    expect(String(payload.htmlReport)).toContain('Non-branded');
    expect(String(payload.htmlReport)).not.toContain('<th>Segment</th>');
    expect(String(payload.htmlReport)).not.toContain('<th>Impr. Δ</th>');
    expect(String(payload.htmlReport)).not.toContain('<th>Pos. Δ</th>');
  });

  it('caps visible monthly client rows without trimming the structured report data', async () => {
    const searchAnalytics = vi.fn().mockImplementation(async (_siteUrl: string, body: Record<string, unknown>) => {
      const dimensions = (body.dimensions as string[] | undefined) ?? [];
      const startDate = String(body.startDate ?? '');

      if (dimensions.join(',') === 'query,page') {
        return { data: { rows: [] } };
      }

      if (dimensions.join(',') === 'date') {
        return startDate === '2026-03-01'
          ? {
              data: {
                rows: [
                  { keys: ['2026-03-01'], clicks: 120, impressions: 1600, ctr: 0.075, position: 6.8 },
                  { keys: ['2026-03-15'], clicks: 140, impressions: 1820, ctr: 0.0769, position: 6.2 },
                ],
              },
            }
          : {
              data: {
                rows: [
                  { keys: ['2026-02-01'], clicks: 92, impressions: 1380, ctr: 0.0667, position: 8.1 },
                  { keys: ['2026-02-15'], clicks: 104, impressions: 1500, ctr: 0.0693, position: 7.5 },
                ],
              },
            };
      }

      if (dimensions.join(',') === 'query') {
        return startDate === '2026-03-01'
          ? {
              data: {
                rows: [
                  { keys: ['query one'], clicks: 60, impressions: 600, ctr: 0.1, position: 4.8 },
                  { keys: ['query two'], clicks: 50, impressions: 540, ctr: 0.0926, position: 5.2 },
                  { keys: ['query three'], clicks: 40, impressions: 460, ctr: 0.087, position: 5.7 },
                  { keys: ['query four'], clicks: 30, impressions: 390, ctr: 0.0769, position: 6.1 },
                  { keys: ['query five'], clicks: 20, impressions: 310, ctr: 0.0645, position: 6.9 },
                  { keys: ['overflow query'], clicks: 10, impressions: 220, ctr: 0.0455, position: 7.6 },
                ],
              },
            }
          : {
              data: {
                rows: [
                  { keys: ['query one'], clicks: 35, impressions: 430, ctr: 0.0814, position: 6.2 },
                  { keys: ['query two'], clicks: 28, impressions: 390, ctr: 0.0718, position: 6.7 },
                  { keys: ['query three'], clicks: 24, impressions: 340, ctr: 0.0706, position: 7.2 },
                  { keys: ['query four'], clicks: 18, impressions: 300, ctr: 0.06, position: 7.5 },
                  { keys: ['query five'], clicks: 14, impressions: 250, ctr: 0.056, position: 8.1 },
                  { keys: ['overflow query'], clicks: 8, impressions: 210, ctr: 0.0381, position: 8.4 },
                ],
              },
            };
      }

      if (dimensions.join(',') === 'page') {
        return startDate === '2026-03-01'
          ? {
              data: {
                rows: [
                  { keys: ['https://example.com/page-one'], clicks: 48, impressions: 530, ctr: 0.0906, position: 5.1 },
                  { keys: ['https://example.com/page-two'], clicks: 32, impressions: 370, ctr: 0.0865, position: 5.9 },
                ],
              },
            }
          : {
              data: {
                rows: [
                  { keys: ['https://example.com/page-one'], clicks: 30, impressions: 420, ctr: 0.0714, position: 6.5 },
                  { keys: ['https://example.com/page-two'], clicks: 20, impressions: 290, ctr: 0.069, position: 7.1 },
                ],
              },
            };
      }

      return { data: { rows: [] } };
    });

    const service = {
      searchAnalytics,
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.78 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      startDate: '2026-03-01',
      endDate: '2026-03-28',
      profile: 'content',
      reportPack: 'monthly_seo',
      reportFormat: 'all',
      detailMode: 'client',
    });

    const payload = parseResult(result);
    const report = payload.report as Record<string, unknown>;
    const monthlySeo = (report.sections as Record<string, unknown>).monthlySeo as Record<string, unknown>;
    const topQueryLabels = ((monthlySeo.popularSearches as Record<string, unknown>).topQueries as Array<Record<string, unknown>>)
      .map((row) => String(row.label));

    expect(topQueryLabels).toHaveLength(6);
    expect(topQueryLabels).toContain('overflow query');
    expect(String(payload.markdownReport)).toContain('query one (Non-branded)');
    expect(String(payload.markdownReport)).toContain('query five (Non-branded)');
    expect(String(payload.markdownReport)).not.toContain('overflow query');
    expect(String(payload.htmlReport)).toContain('query one');
    expect(String(payload.htmlReport)).toContain('query five');
    expect(String(payload.htmlReport)).not.toContain('overflow query');
  });

  it('keeps monthly SEO report renderable when comparison data is empty', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: { rows: [] },
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      profile: 'content',
      reportPack: 'monthly_seo',
      reportFormat: 'all',
    });

    const payload = parseResult(result);
    const report = payload.report as Record<string, unknown>;
    const monthlySeo = (report.sections as Record<string, unknown>).monthlySeo as Record<string, unknown>;
    const summary = monthlySeo.summary as Record<string, unknown>;

    expect(monthlySeo.kpiSummary).toEqual(expect.any(Array));
    expect(monthlySeo.brandPerformance).toEqual([]);
    expect(summary).toEqual(
      expect.objectContaining({
        headline: 'No meaningful month-over-month movement stood out in the selected period.',
        whatImproved: expect.any(Array),
        needsAttention: expect.any(Array),
        doingNext: expect.arrayContaining(['No immediate next steps were pulled through from this run.']),
      }),
    );
    expect(String(payload.markdownReport)).toContain('## TL;DR');
    expect(String(payload.markdownReport)).toContain(
      'No major improvements stood out strongly enough to call out this period.',
    );
    expect(String(payload.markdownReport)).toContain('No notable movement in this section for the selected period.');
    expect(String(payload.htmlReport)).toContain('TL;DR');
    expect(String(payload.htmlReport)).toContain(
      'No major improvements stood out strongly enough to call out this period.',
    );
    expect(String(payload.htmlReport)).toContain('No notable movement in this section for the selected period.');
    expect(String(payload.markdownReport)).not.toContain('## Analyst Appendix');
    expect(String(payload.htmlReport)).not.toContain('Analyst Appendix');
    expect(String(payload.htmlReport)).not.toContain('Workflow Steps');
  });

  it('keeps the monthly renderer active when monthly enrichment fails in client mode', async () => {
    const service = {
      searchAnalytics: vi.fn().mockImplementation((_, body: { dimensions?: string[] }) => {
        if (body.dimensions?.join(',') === 'date') {
          return Promise.reject(new Error('month data offline'));
        }
        return Promise.resolve({
          data: { rows: [] },
        });
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      profile: 'content',
      reportPack: 'monthly_seo',
      reportFormat: 'all',
      detailMode: 'client',
    });

    const payload = parseResult(result);
    const report = payload.report as Record<string, unknown>;
    const monthlySeo = (report.sections as Record<string, unknown>).monthlySeo as Record<string, unknown>;
    const summary = monthlySeo.summary as Record<string, unknown>;

    expect(monthlySeo.note).toBe(
      'Monthly performance comparison could not be generated for this run.',
    );
    expect(summary).toEqual(
      expect.objectContaining({
        headline:
          "This month's detailed comparison was limited, so the report below focuses on workflow findings and next steps.",
        needsAttention: expect.arrayContaining([
          'Monthly performance comparison could not be generated for this run.',
        ]),
        doingNext: expect.any(Array),
      }),
    );
    expect(String(payload.markdownReport)).toContain('## Report Note');
    expect(String(payload.markdownReport)).toContain('## TL;DR');
    expect(String(payload.markdownReport)).toContain("### What We're Doing Next");
    expect(String(payload.markdownReport)).toContain('## KPI Summary');
    expect(String(payload.markdownReport)).not.toContain('## Executive Summary');
    expect(String(payload.markdownReport)).not.toContain('## Analyst Appendix');
    expect(String(payload.htmlReport)).toContain('Report Note');
    expect(String(payload.htmlReport)).toContain('TL;DR');
    expect(String(payload.htmlReport)).toContain("What we're doing next");
    expect(String(payload.htmlReport)).toContain('Monthly KPI summary was not available for this run.');
    expect(String(payload.htmlReport)).not.toContain('Analyst Appendix');
    expect(String(payload.htmlReport)).not.toContain('Workflow Steps');
    expect(String(payload.htmlReport)).not.toContain('month data offline');
    expect(payload.analystSummary).toBeUndefined();
  });

  it('keeps top-level analystSummary in sync with the monthly report audience after enrichment failures', async () => {
    const service = {
      searchAnalytics: vi.fn().mockImplementation((_, body: { dimensions?: string[] }) => {
        if (body.dimensions?.join(',') === 'date') {
          return Promise.reject(new Error('month data offline'));
        }
        return Promise.resolve({
          data: { rows: [] },
        });
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      profile: 'content',
      reportPack: 'monthly_seo',
      reportFormat: 'all',
      detailMode: 'both',
    });

    const payload = parseResult(result);
    const report = payload.report as Record<string, unknown>;
    const audience = (report.audience as Record<string, unknown>).analystSummary as Array<string>;

    expect(payload.analystSummary).toEqual(audience);
    expect(audience).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Monthly client report enrichment failed: month data offline'),
      ]),
    );
  });

  it('returns htmlReport only when reportFormat=html', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: { rows: [] },
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      profile: 'content',
      reportFormat: 'html',
      brand: {
        name: 'Nth Agency',
        accentColor: '#0F172A',
      },
    });

    const payload = parseResult(result);
    expect(payload.reportFormat).toBe('html');
    expect(payload.markdownReport).toBeUndefined();
    expect(typeof payload.htmlReport).toBe('string');
    expect(String(payload.htmlReport)).toContain('Standard content workflow handoff without a report-pack preset.');
    expect(String(payload.htmlReport)).toContain('Nth Agency');
    expect(payload.analystSummary).toBeUndefined();
    expect(payload.clientSummary).toEqual(expect.any(Array));
    expect((payload.report as Record<string, unknown>).meta).toEqual(
      expect.objectContaining({
        format: 'html',
      }),
    );
  });

  it('keeps markdown alias working when reportFormat is omitted', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: { rows: [] },
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      profile: 'content',
      markdown: true,
    });

    const payload = parseResult(result);
    expect(payload.reportFormat).toBe('markdown');
    expect(typeof payload.markdownReport).toBe('string');
    expect((payload.report as Record<string, unknown>).meta).toEqual(
      expect.objectContaining({
        format: 'markdown',
        detailMode: 'client',
      }),
    );
  });

  it('lets reportFormat override the legacy markdown flag', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: { rows: [] },
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      profile: 'content',
      reportFormat: 'json',
      markdown: true,
    });

    const payload = parseResult(result);
    expect(payload.reportFormat).toBe('json');
    expect(payload.markdownReport).toBeUndefined();
    expect((payload.report as Record<string, unknown>).meta).toEqual(
      expect.objectContaining({
        format: 'json',
      }),
    );
  });

  it('escapes HTML-sensitive brand values in html output', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: { rows: [] },
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      profile: 'content',
      reportFormat: 'html',
      brand: {
        name: 'Nth <Agency>',
        accentColor: '#0F172A',
      },
    });

    const payload = parseResult(result);
    expect(String(payload.htmlReport)).toContain('Nth &lt;Agency&gt;');
    expect(String(payload.htmlReport)).not.toContain('Nth <Agency>');
  });

  it('keeps analyst-only detail out of client mode payloads', async () => {
    const service = {
      searchAnalytics: vi
        .fn()
        .mockResolvedValueOnce({
          data: { rows: [] },
        })
        .mockResolvedValueOnce({
          data: { rows: [] },
        })
        .mockResolvedValueOnce({
          data: { rows: [] },
        }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      profile: 'content',
      detailMode: 'client',
    });

    const payload = parseResult(result);
    expect(payload.analystSummary).toBeUndefined();
    expect((payload.actions as Array<Record<string, unknown>>).every((item) => !('analystDetail' in item))).toBe(
      true,
    );
    expect((payload.issues as Array<Record<string, unknown>>).every((item) => !('analystDetail' in item))).toBe(
      true,
    );
  });

  it('keeps workflow valid when one step fails', async () => {
    const service = {
      searchAnalytics: vi
        .fn()
        .mockResolvedValueOnce({
          data: { rows: [{ keys: ['q1', 'https://example.com/a'], clicks: 1, impressions: 200, ctr: 0.01, position: 5 }] },
        })
        .mockRejectedValueOnce(new Error('analytics down'))
        .mockResolvedValueOnce({
          data: { rows: [{ keys: ['q2', 'https://example.com/b'], clicks: 5, impressions: 500, ctr: 0.02, position: 6 }] },
        }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      profile: 'content',
    });

    const payload = parseResult(result);
    const steps = payload.steps as Array<Record<string, unknown>>;
    const statuses = steps.map((step) => step.status);

    expect(statuses).toContain('error');
    expect(statuses).toContain('success');
    expect((payload.executiveSummary as Record<string, unknown>).overallStatus).toBe('partial');
  });

  it('sanitizes client-facing error summaries in rendered reports', async () => {
    const service = {
      searchAnalytics: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            rows: [{ keys: ['q1', 'https://example.com/a'], clicks: 1, impressions: 200, ctr: 0.01, position: 5 }],
          },
        })
        .mockRejectedValueOnce(new Error('analytics token secret-leak'))
        .mockResolvedValueOnce({
          data: {
            rows: [{ keys: ['q2', 'https://example.com/b'], clicks: 5, impressions: 500, ctr: 0.02, position: 6 }],
          },
        }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      profile: 'content',
      detailMode: 'client',
      reportFormat: 'all',
    });

    const payload = parseResult(result);
    const issues = payload.issues as Array<Record<string, unknown>>;

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clientSummary: 'One workflow step failed and needs analyst follow-up.',
        }),
      ]),
    );
    expect(payload.analystSummary).toBeUndefined();
    expect(String(payload.markdownReport)).toContain(
      'One workflow step failed and needs analyst follow-up.',
    );
    expect(String(payload.htmlReport)).toContain(
      'One workflow step failed and needs analyst follow-up.',
    );
    expect(String(payload.markdownReport)).not.toContain('secret-leak');
    expect(String(payload.htmlReport)).not.toContain('secret-leak');
  });

  it('uses explicit date ranges consistently across workflow steps', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: {
          rows: [],
        },
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      startDate: '2026-01-01',
      endDate: '2026-01-28',
      profile: 'content',
    });

    const calls = (service.searchAnalytics as ReturnType<typeof vi.fn>).mock.calls;
    const requestBodies = calls.map(([, body]) => body as Record<string, unknown>);

    expect(requestBodies).toContainEqual(
      expect.objectContaining({
        startDate: '2026-01-01',
        endDate: '2026-01-28',
      }),
    );
    expect(requestBodies).toContainEqual(
      expect.objectContaining({
        startDate: '2026-01-15',
        endDate: '2026-01-28',
      }),
    );
    expect(requestBodies).toContainEqual(
      expect.objectContaining({
        startDate: '2026-01-01',
        endDate: '2026-01-14',
      }),
    );
  });
});
