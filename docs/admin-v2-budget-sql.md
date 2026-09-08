# Stage 2 budget — SQL execution evidence

Generated from the unchanged Stage 2 growth fixture on 2026-09-08. **Local profiling/estimates, not Cloudflare billing.** See [budget decision](admin-v2-free-tier-budget.md), [before raw SQL/binds/plans/counters](admin-budget-before.json) and [after raw SQL/binds/plans/counters](admin-budget-after.json).

Each Q number is the one-based query index in the corresponding JSON endpoint's `queries` array. Q1 is the real active-Admin lookup, not an assumed permanent permission. Full SQL and EXPLAIN QUERY PLAN are in those files. P/A are polling/explicit calls across three contexts/12h; each SQL executes once per such endpoint call. Other sampled variants have zero scenario calls, deliberately not charged as simultaneous screens. The 60 unspecified Member tab interactions are illustrated as ten each of reservations/photos/history/Points/Club/Mailing per context (180 total); the headline instead retains a larger uniform 100-row allowance for any selected tab. Search uses the no-match execution for attribution plus the existing 5,000-row envelope in the headline, not the cheap first BMW page.

Visits are measured SQLite scanstatus entries (including reported intermediates). Estimate adds non-covering table/index probe allowance and uninstrumented fast-COUNT population. VM means a measured statement instruction count used as a deliberately coarse ceiling; it is NOT a row measurement. Shares use the corrected model total (before 5373090, after 3549822). Unassigned envelope headroom is reported below, not fabricated as SQL work.

## before

| Endpoint / SQL | P calls | A calls | Local visits or VM | Est. / call | Contribution | Share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| summary Q1 | 144 | 99 | 1 | 2 | 486 | 0.009% |
| summary Q2 | 144 | 99 | 3101 | 4269 | 1037367 | 19.307% |
| reservation-list Q1 | 180 | 96 | 1 | 2 | 552 | 0.010% |
| reservation-list Q2 | 180 | 96 | 3 | 6 | 1656 | 0.031% |
| reservation-list Q3 | 180 | 96 | 3017 | 4711 | 1300236 | 24.199% |
| reservation-list Q4 | 180 | 96 | 601 | 901 | 248676 | 4.628% |
| reservation-list Q5 | 180 | 96 | 601 | 902 | 248952 | 4.633% |
| reservation-detail Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| reservation-detail Q2 | 0 | 0 | 3 | 6 | 0 | 0.000% |
| reservation-detail Q3 | 0 | 0 | 6 | 12 | 0 | 0.000% |
| reservation-detail Q4 | 0 | 0 | 3 | 4 | 0 | 0.000% |
| reservation-detail Q5 | 0 | 0 | 601 | 902 | 0 | 0.000% |
| reservation-pending-detail Q1 | 360 | 96 | 1 | 2 | 912 | 0.017% |
| reservation-pending-detail Q2 | 360 | 96 | 3 | 6 | 2736 | 0.051% |
| reservation-pending-detail Q3 | 360 | 96 | 1627 | 1993 | 908808 | 16.914% |
| reservation-pending-detail Q4 | 360 | 96 | 3 | 4 | 1824 | 0.034% |
| reservation-pending-detail Q5 | 360 | 96 | 601 | 902 | 411312 | 7.655% |
| accommodation Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| accommodation Q2 | 0 | 0 | 3 | 6 | 0 | 0.000% |
| accommodation Q3 | 0 | 0 | 363 | 725 | 0 | 0.000% |
| gallery Q1 | 90 | 0 | 1 | 2 | 180 | 0.003% |
| gallery Q2 | 90 | 0 | 296 | 518 | 46620 | 0.868% |
| gallery Q3 | 90 | 0 | 750 | 750 | 67500 | 1.256% |
| history-review Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| history-review Q2 | 0 | 0 | 2000 | 3000 | 0 | 0.000% |
| history-review Q3 | 0 | 0 | 151 | 302 | 0 | 0.000% |
| history-review Q4 | 0 | 0 | 3000 | 4000 | 0 | 0.000% |
| history-review Q5 | 0 | 0 | 201 | 402 | 0 | 0.000% |
| history-review Q6 | 0 | 0 | 275 | 500 | 0 | 0.000% |
| history-review Q7 | 0 | 0 | 0 | 1 | 0 | 0.000% |
| events Q1 | 0 | 3 | 1 | 2 | 6 | 0.000% |
| events Q2 | 0 | 3 | 7 | 14 | 42 | 0.001% |
| funnel Q1 | 0 | 3 | 1 | 2 | 6 | 0.000% |
| funnel Q2 | 0 | 3 | 3 | 6 | 18 | 0.000% |
| funnel Q3 | 0 | 3 | 0 | 500 | 1500 | 0.028% |
| funnel Q4 | 0 | 3 | 0 | 1 | 3 | 0.000% |
| funnel Q5 | 0 | 3 | 0 | 1 | 3 | 0.000% |
| funnel Q6 | 0 | 3 | 0 | 1 | 3 | 0.000% |
| funnel Q7 | 0 | 3 | 0 | 1 | 3 | 0.000% |
| funnel Q8 | 0 | 3 | 0 | 1 | 3 | 0.000% |
| member-list Q1 | 0 | 3 | 1 | 2 | 6 | 0.000% |
| member-list Q2 | 0 | 3 | 30 | 60 | 180 | 0.003% |
| member-list Q3 | 0 | 3 | 0 | 500 | 1500 | 0.028% |
| member-search Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| member-search Q2 | 0 | 0 | 40 | 80 | 0 | 0.000% |
| member-search Q3 | 0 | 0 | 1000 | 1500 | 0 | 0.000% |
| member-search-miss Q1 | 0 | 180 | 1 | 2 | 360 | 0.007% |
| member-search-miss Q2 | 0 | 180 | 1250 | 2500 | 450000 | 8.375% |
| member-search-miss Q3 | 0 | 180 | 1250 | 2000 | 360000 | 6.700% |
| member-search-last-page Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| member-search-last-page Q2 | 0 | 0 | 1000 | 2000 | 0 | 0.000% |
| member-search-last-page Q3 | 0 | 0 | 1000 | 1500 | 0 | 0.000% |
| member-qr-resolve Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| member-qr-resolve Q2 | 0 | 0 | 2 | 3 | 0 | 0.000% |
| member-media Q1 | 0 | 1170 | 1 | 2 | 2340 | 0.044% |
| member-media Q2 | 0 | 1170 | 2 | 4 | 4680 | 0.087% |
| member-header Q1 | 1440 | 180 | 1 | 2 | 3240 | 0.060% |
| member-header Q2 | 1440 | 180 | 1 | 2 | 3240 | 0.060% |
| member-header Q3 | 1440 | 180 | 1 | 2 | 3240 | 0.060% |
| member-header Q4 | 1440 | 180 | 3 | 6 | 9720 | 0.181% |
| member-reservations Q1 | 0 | 30 | 1 | 2 | 60 | 0.001% |
| member-reservations Q2 | 0 | 30 | 1 | 2 | 60 | 0.001% |
| member-reservations Q3 | 0 | 30 | 12 | 21 | 630 | 0.012% |
| member-reservations Q4 | 0 | 30 | 9 | 12 | 360 | 0.007% |
| member-garage Q1 | 720 | 0 | 1 | 2 | 1440 | 0.027% |
| member-garage Q2 | 720 | 0 | 1 | 2 | 1440 | 0.027% |
| member-garage Q3 | 720 | 0 | 6 | 9 | 6480 | 0.121% |
| member-garage Q4 | 720 | 0 | 3 | 3 | 2160 | 0.040% |
| member-garage Q5 | 720 | 0 | 7 | 13 | 9360 | 0.174% |
| member-photos Q1 | 0 | 30 | 1 | 2 | 60 | 0.001% |
| member-photos Q2 | 0 | 30 | 1 | 2 | 60 | 0.001% |
| member-photos Q3 | 0 | 30 | 6 | 9 | 270 | 0.005% |
| member-photos Q4 | 0 | 30 | 3 | 3 | 90 | 0.002% |
| member-club Q1 | 0 | 30 | 1 | 2 | 60 | 0.001% |
| member-club Q2 | 0 | 30 | 1 | 2 | 60 | 0.001% |
| member-club Q3 | 0 | 30 | 4 | 8 | 240 | 0.004% |
| member-club Q4 | 0 | 30 | 11 | 22 | 660 | 0.012% |
| member-club Q5 | 0 | 30 | 2 | 2 | 60 | 0.001% |
| member-history Q1 | 0 | 30 | 1 | 2 | 60 | 0.001% |
| member-history Q2 | 0 | 30 | 1 | 2 | 60 | 0.001% |
| member-history Q3 | 0 | 30 | 6 | 10 | 300 | 0.006% |
| member-history Q4 | 0 | 30 | 4 | 4 | 120 | 0.002% |
| member-history Q5 | 0 | 30 | 4 | 8 | 240 | 0.004% |
| member-points Q1 | 0 | 30 | 1 | 2 | 60 | 0.001% |
| member-points Q2 | 0 | 30 | 1 | 2 | 60 | 0.001% |
| member-points Q3 | 0 | 30 | 22 | 33 | 990 | 0.018% |
| member-points Q4 | 0 | 30 | 11 | 11 | 330 | 0.006% |
| member-mailing Q1 | 0 | 30 | 1 | 2 | 60 | 0.001% |
| member-mailing Q2 | 0 | 30 | 1 | 2 | 60 | 0.001% |
| member-mailing Q3 | 0 | 30 | 1 | 2 | 60 | 0.001% |
| member-mailing Q4 | 0 | 30 | 7 | 12 | 360 | 0.007% |
| member-mailing Q5 | 0 | 30 | 5 | 8 | 240 | 0.004% |
| member-qr Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| member-qr Q2 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| member-qr Q3 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| mailing-overview Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| mailing-overview Q2 | 0 | 0 | VM 374429 | 374429 | 0 | 0.000% |
| mailing-overview Q3 | 0 | 0 | 1 | 1 | 0 | 0.000% |
| mailing-contacts Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| mailing-contacts Q2 | 0 | 0 | VM 374429 | 374429 | 0 | 0.000% |
| mailing-campaigns Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| mailing-campaigns Q2 | 0 | 0 | 0 | 1 | 0 | 0.000% |
| mailing-campaigns Q3 | 0 | 0 | 2 | 2 | 0 | 0.000% |
| mailing-campaigns/camp/delivery Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| mailing-campaigns/camp/delivery Q2 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| mailing-campaigns/camp/delivery Q3 | 0 | 0 | VM 374429 | 374429 | 0 | 0.000% |
| mailing-campaigns/camp/delivery Q4 | 0 | 0 | 501 | 1002 | 0 | 0.000% |
| mailing-campaigns/camp/delivery Q5 | 0 | 0 | VM 22 | 22 | 0 | 0.000% |
| mailing-campaigns/camp/delivery Q6 | 0 | 0 | 500 | 1000 | 0 | 0.000% |
| mailing-campaigns/camp/delivery Q7 | 0 | 0 | 0 | 0 | 0 | 0.000% |
| explicit-operation Q1 | 0 | 60 | VM 15 | 15 | 900 | 0.017% |
| explicit-operation Q2 | 0 | 60 | VM 10 | 10 | 600 | 0.011% |
| explicit-operation Q3 | 0 | 60 | VM 14 | 14 | 840 | 0.016% |
| explicit-operation Q4 | 0 | 60 | VM 16 | 16 | 960 | 0.018% |
| explicit-operation Q5 | 0 | 60 | VM 34 | 34 | 2040 | 0.038% |
| explicit-operation Q6 | 0 | 60 | VM 33 | 33 | 1980 | 0.037% |
| explicit-operation Q7 | 0 | 60 | VM 53 | 53 | 3180 | 0.059% |
| explicit-operation Q8 | 0 | 60 | VM 151 | 151 | 9060 | 0.169% |
| explicit-operation Q9 | 0 | 60 | VM 34 | 34 | 2040 | 0.038% |
| explicit-operation Q10 | 0 | 60 | VM 54 | 54 | 3240 | 0.060% |
| explicit-operation Q11 | 0 | 60 | VM 50 | 50 | 3000 | 0.056% |
| explicit-operation Q12 | 0 | 60 | VM 34 | 34 | 2040 | 0.038% |
| explicit-operation Q13 | 0 | 60 | VM 24 | 24 | 1440 | 0.027% |
| explicit-receipt Q1 | 0 | 60 | VM 15 | 15 | 900 | 0.017% |
| explicit-receipt Q2 | 0 | 60 | VM 28 | 28 | 1680 | 0.031% |

Assigned SQL/VM ceilings: **5178360**. Remaining **194730** is explicitly reserved endpoint headroom (Member/search/operation envelopes), not measured or uniquely attributable to one SQL. Combined: **5373090**, then add 10% retry reserve. Every nonzero query in the original worked scenario is represented; no prolonged global Mailing/history-review/accommodation session has been invented.

## after

| Endpoint / SQL | P calls | A calls | Local visits or VM | Est. / call | Contribution | Share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| summary Q1 | 144 | 99 | 1 | 2 | 486 | 0.014% |
| summary Q2 | 144 | 99 | 3101 | 4269 | 1037367 | 29.223% |
| reservation-list Q1 | 180 | 96 | 1 | 2 | 552 | 0.016% |
| reservation-list Q2 | 180 | 96 | 3 | 6 | 1656 | 0.047% |
| reservation-list Q3 | 180 | 96 | 962 | 1672 | 461472 | 13.000% |
| reservation-list Q4 | 180 | 96 | 601 | 901 | 248676 | 7.005% |
| reservation-list Q5 | 180 | 96 | 601 | 902 | 248952 | 7.013% |
| reservation-detail Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| reservation-detail Q2 | 0 | 0 | 3 | 6 | 0 | 0.000% |
| reservation-detail Q3 | 0 | 0 | 10 | 16 | 0 | 0.000% |
| reservation-detail Q4 | 0 | 0 | 3 | 4 | 0 | 0.000% |
| reservation-detail Q5 | 0 | 0 | 601 | 902 | 0 | 0.000% |
| reservation-pending-detail Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| reservation-pending-detail Q2 | 0 | 0 | 3 | 6 | 0 | 0.000% |
| reservation-pending-detail Q3 | 0 | 0 | 373 | 740 | 0 | 0.000% |
| reservation-pending-detail Q4 | 0 | 0 | 3 | 4 | 0 | 0.000% |
| reservation-pending-detail Q5 | 0 | 0 | 601 | 902 | 0 | 0.000% |
| reservation-detail-only Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| reservation-detail-only Q2 | 0 | 0 | 3 | 6 | 0 | 0.000% |
| reservation-detail-only Q3 | 0 | 0 | 10 | 16 | 0 | 0.000% |
| reservation-pending-detail-only Q1 | 360 | 96 | 1 | 2 | 912 | 0.026% |
| reservation-pending-detail-only Q2 | 360 | 96 | 3 | 6 | 2736 | 0.077% |
| reservation-pending-detail-only Q3 | 360 | 96 | 373 | 740 | 337440 | 9.506% |
| accommodation Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| accommodation Q2 | 0 | 0 | 3 | 6 | 0 | 0.000% |
| accommodation Q3 | 0 | 0 | 363 | 725 | 0 | 0.000% |
| gallery Q1 | 90 | 0 | 1 | 2 | 180 | 0.005% |
| gallery Q2 | 90 | 0 | 296 | 518 | 46620 | 1.313% |
| gallery Q3 | 90 | 0 | 750 | 750 | 67500 | 1.902% |
| history-review Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| history-review Q2 | 0 | 0 | 2000 | 3000 | 0 | 0.000% |
| history-review Q3 | 0 | 0 | 151 | 302 | 0 | 0.000% |
| history-review Q4 | 0 | 0 | 3000 | 4000 | 0 | 0.000% |
| history-review Q5 | 0 | 0 | 201 | 402 | 0 | 0.000% |
| history-review Q6 | 0 | 0 | 275 | 500 | 0 | 0.000% |
| history-review Q7 | 0 | 0 | 0 | 1 | 0 | 0.000% |
| events Q1 | 0 | 3 | 1 | 2 | 6 | 0.000% |
| events Q2 | 0 | 3 | 7 | 14 | 42 | 0.001% |
| funnel Q1 | 0 | 3 | 1 | 2 | 6 | 0.000% |
| funnel Q2 | 0 | 3 | 3 | 6 | 18 | 0.001% |
| funnel Q3 | 0 | 3 | 0 | 500 | 1500 | 0.042% |
| funnel Q4 | 0 | 3 | 0 | 1 | 3 | 0.000% |
| funnel Q5 | 0 | 3 | 0 | 1 | 3 | 0.000% |
| funnel Q6 | 0 | 3 | 0 | 1 | 3 | 0.000% |
| funnel Q7 | 0 | 3 | 0 | 1 | 3 | 0.000% |
| funnel Q8 | 0 | 3 | 0 | 1 | 3 | 0.000% |
| member-list Q1 | 0 | 3 | 1 | 2 | 6 | 0.000% |
| member-list Q2 | 0 | 3 | 30 | 60 | 180 | 0.005% |
| member-list Q3 | 0 | 3 | 0 | 500 | 1500 | 0.042% |
| member-search Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| member-search Q2 | 0 | 0 | 40 | 80 | 0 | 0.000% |
| member-search Q3 | 0 | 0 | 1000 | 1500 | 0 | 0.000% |
| member-search-miss Q1 | 0 | 180 | 1 | 2 | 360 | 0.010% |
| member-search-miss Q2 | 0 | 180 | 1250 | 2500 | 450000 | 12.677% |
| member-search-miss Q3 | 0 | 180 | 1250 | 2000 | 360000 | 10.141% |
| member-search-last-page Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| member-search-last-page Q2 | 0 | 0 | 1000 | 2000 | 0 | 0.000% |
| member-search-last-page Q3 | 0 | 0 | 1000 | 1500 | 0 | 0.000% |
| member-qr-resolve Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| member-qr-resolve Q2 | 0 | 0 | 2 | 3 | 0 | 0.000% |
| member-media Q1 | 0 | 1170 | 1 | 2 | 2340 | 0.066% |
| member-media Q2 | 0 | 1170 | 2 | 4 | 4680 | 0.132% |
| member-header Q1 | 1440 | 180 | 1 | 2 | 3240 | 0.091% |
| member-header Q2 | 1440 | 180 | 1 | 2 | 3240 | 0.091% |
| member-header Q3 | 1440 | 180 | 1 | 2 | 3240 | 0.091% |
| member-header Q4 | 1440 | 180 | 3 | 6 | 9720 | 0.274% |
| member-reservations Q1 | 0 | 30 | 1 | 2 | 60 | 0.002% |
| member-reservations Q2 | 0 | 30 | 1 | 2 | 60 | 0.002% |
| member-reservations Q3 | 0 | 30 | 12 | 21 | 630 | 0.018% |
| member-reservations Q4 | 0 | 30 | 9 | 12 | 360 | 0.010% |
| member-garage Q1 | 720 | 0 | 1 | 2 | 1440 | 0.041% |
| member-garage Q2 | 720 | 0 | 1 | 2 | 1440 | 0.041% |
| member-garage Q3 | 720 | 0 | 6 | 9 | 6480 | 0.183% |
| member-garage Q4 | 720 | 0 | 3 | 3 | 2160 | 0.061% |
| member-garage Q5 | 720 | 0 | 7 | 13 | 9360 | 0.264% |
| member-photos Q1 | 0 | 30 | 1 | 2 | 60 | 0.002% |
| member-photos Q2 | 0 | 30 | 1 | 2 | 60 | 0.002% |
| member-photos Q3 | 0 | 30 | 6 | 9 | 270 | 0.008% |
| member-photos Q4 | 0 | 30 | 3 | 3 | 90 | 0.003% |
| member-club Q1 | 0 | 30 | 1 | 2 | 60 | 0.002% |
| member-club Q2 | 0 | 30 | 1 | 2 | 60 | 0.002% |
| member-club Q3 | 0 | 30 | 4 | 8 | 240 | 0.007% |
| member-club Q4 | 0 | 30 | 11 | 22 | 660 | 0.019% |
| member-club Q5 | 0 | 30 | 2 | 2 | 60 | 0.002% |
| member-history Q1 | 0 | 30 | 1 | 2 | 60 | 0.002% |
| member-history Q2 | 0 | 30 | 1 | 2 | 60 | 0.002% |
| member-history Q3 | 0 | 30 | 6 | 10 | 300 | 0.008% |
| member-history Q4 | 0 | 30 | 4 | 4 | 120 | 0.003% |
| member-history Q5 | 0 | 30 | 4 | 8 | 240 | 0.007% |
| member-points Q1 | 0 | 30 | 1 | 2 | 60 | 0.002% |
| member-points Q2 | 0 | 30 | 1 | 2 | 60 | 0.002% |
| member-points Q3 | 0 | 30 | 22 | 33 | 990 | 0.028% |
| member-points Q4 | 0 | 30 | 11 | 11 | 330 | 0.009% |
| member-mailing Q1 | 0 | 30 | 1 | 2 | 60 | 0.002% |
| member-mailing Q2 | 0 | 30 | 1 | 2 | 60 | 0.002% |
| member-mailing Q3 | 0 | 30 | 1 | 2 | 60 | 0.002% |
| member-mailing Q4 | 0 | 30 | 7 | 12 | 360 | 0.010% |
| member-mailing Q5 | 0 | 30 | 5 | 8 | 240 | 0.007% |
| member-qr Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| member-qr Q2 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| member-qr Q3 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| mailing-overview Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| mailing-overview Q2 | 0 | 0 | VM 374429 | 374429 | 0 | 0.000% |
| mailing-overview Q3 | 0 | 0 | 1 | 1 | 0 | 0.000% |
| mailing-contacts Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| mailing-contacts Q2 | 0 | 0 | VM 374429 | 374429 | 0 | 0.000% |
| mailing-campaigns Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| mailing-campaigns Q2 | 0 | 0 | 0 | 1 | 0 | 0.000% |
| mailing-campaigns Q3 | 0 | 0 | 2 | 2 | 0 | 0.000% |
| mailing-campaigns/camp/delivery Q1 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| mailing-campaigns/camp/delivery Q2 | 0 | 0 | 1 | 2 | 0 | 0.000% |
| mailing-campaigns/camp/delivery Q3 | 0 | 0 | VM 374429 | 374429 | 0 | 0.000% |
| mailing-campaigns/camp/delivery Q4 | 0 | 0 | 501 | 1002 | 0 | 0.000% |
| mailing-campaigns/camp/delivery Q5 | 0 | 0 | VM 22 | 22 | 0 | 0.000% |
| mailing-campaigns/camp/delivery Q6 | 0 | 0 | 500 | 1000 | 0 | 0.000% |
| mailing-campaigns/camp/delivery Q7 | 0 | 0 | 0 | 0 | 0 | 0.000% |
| explicit-operation Q1 | 0 | 60 | VM 15 | 15 | 900 | 0.025% |
| explicit-operation Q2 | 0 | 60 | VM 10 | 10 | 600 | 0.017% |
| explicit-operation Q3 | 0 | 60 | VM 14 | 14 | 840 | 0.024% |
| explicit-operation Q4 | 0 | 60 | VM 16 | 16 | 960 | 0.027% |
| explicit-operation Q5 | 0 | 60 | VM 34 | 34 | 2040 | 0.057% |
| explicit-operation Q6 | 0 | 60 | VM 33 | 33 | 1980 | 0.056% |
| explicit-operation Q7 | 0 | 60 | VM 53 | 53 | 3180 | 0.090% |
| explicit-operation Q8 | 0 | 60 | VM 179 | 179 | 10740 | 0.303% |
| explicit-operation Q9 | 0 | 60 | VM 34 | 34 | 2040 | 0.057% |
| explicit-operation Q10 | 0 | 60 | VM 54 | 54 | 3240 | 0.091% |
| explicit-operation Q11 | 0 | 60 | VM 50 | 50 | 3000 | 0.085% |
| explicit-operation Q12 | 0 | 60 | VM 34 | 34 | 2040 | 0.057% |
| explicit-operation Q13 | 0 | 60 | VM 24 | 24 | 1440 | 0.041% |
| explicit-receipt Q1 | 0 | 60 | VM 15 | 15 | 900 | 0.025% |
| explicit-receipt Q2 | 0 | 60 | VM 28 | 28 | 1680 | 0.047% |

Assigned SQL/VM ceilings: **3356772**. Remaining **193050** is explicitly reserved endpoint headroom (Member/search/operation envelopes), not measured or uniquely attributable to one SQL. Combined: **3549822**, then add 10% retry reserve. Every nonzero query in the original worked scenario is represented; no prolonged global Mailing/history-review/accommodation session has been invented.

## Profiler limitation

The stock SQLite scanstatus display exited 3221225477 for the legacy contact-universe query and one empty delivery aggregate. The contact-query crash reproduced with official Windows shells 3.50.4 and 3.53.4. The identical SQL succeeds with scanstatus display disabled; the script requires a successful re-execution and records Fullscan Steps/VM Steps. It does not silently skip the endpoint, replace failed work with zero, or change the query to placate tooling. For the contact universe:25,552 local fullscan steps,374,429 VM steps; the latter is the coarse ceiling used in the evidence. No inference of374,429 billed D1 rows is made.

For explicit payment, the script executes the captured statements in order in a second disposable local SQLite copy. Bound synthetic values are encoded as SQL literals; there are no intervening parameter-table writes that could corrupt `changes()`. This retains CAS/receipt ordering while collecting the whole statement's VM steps, including trigger programs. BEFORE/AFTER operation ceilings 522/550 VM steps; one outcome lookup including auth 43. The workload uses 1,000 per operation as additional headroom, not 522/550 measured D1 reads. This models the worked payment/edit path; a high-fanout accommodation/catalog mutation is NOT proven bounded by that allowance.
