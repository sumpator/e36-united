# Appearance coverage — 2026-09-23

One browser-local dark/light/system preference; dark remains the default. No API,
database or business-state changes. Email content/QR modules are not themed.

- [x] Public styles: home/program/Show & Shine/Planner, gallery/profile/lightbox, merch,
  about/history, shared navigation/footer/auth and mobile menus.
- [x] Member styles: overview/profile, preliminary/approved registration and Planner,
  garage/car dialogs, payments/QR, Club, photos, account, loading/error/empty states.
- [x] Admin styles: shell/dashboard, members/detail, registrations/payments, accommodation,
  moderation/history, mailing editor (email preview retains email colors), settings.
- [x] LIVE styles: member program/voting/photos/QR, organization categories/member/car
  selection/judging/history/results, menus/dialogs/states.
- [x] Targeted checks: 1440/390 and narrow 360; dark representative controls;
  draft preservation, persistence, system change, unavailable storage, zero requests.

Palette: neutral page, white surfaces, blue-gray supporting surfaces, near-black
type, United blue actions. Existing CSS declarations receive semantic fallbacks
so dark mode retains original values. Photographic scenes keep readable local
dark overlays. No filter/inversion, scale or business changes.

## Verification evidence

`tests/e2e/appearance.spec.mjs`: 24 targeted Chromium scenarios, verified in
component-sized runs (not the complete browser suite). Covers four public entries
at 1440/390, eight Admin views and Member 360, seven Member sections, approved
registration/change modal, preliminary save/car modal, both LIVE surfaces at
1440/390/360, mobile menu, persistence across entries/reload, system changes,
draft preservation and zero requests on preference change. All final scenario
results passed with retries disabled. Early failures were in the new fixture
setup/screenshot helper and mobile payment table containment; corrected in scope.

Screenshots in ignored `test-results/appearance/` were opened for visual review:
public home/Planner/merch, Member overview/account/registration and photo header,
Planner/car dialog, Admin dashboard/payment/settings/Member 360, Member LIVE and
Admin judging. Real repository photographs were used for representative media.
These are isolated fixtures, not production account screenshots.

`tests/appearance.test.mjs`: synchronous default/bootstrap, shared preference,
system behavior, unavailable storage, cross-tab synchronization, six HTML entry
contracts and semantic palette contrast. Syntax and diff checks pass.
Removing semantic wrappers from every migrated existing CSS file reproduces its
original CSS (ignoring whitespace), proving unchanged original dark fallbacks.
Small shared layout changes only make room for appearance controls and keep the
existing wide payment table inside its own horizontal scroller.

Not an exhaustive visual matrix of every possible record/error or browser engine:
WebKit/full suites and CI monitoring are deliberately excluded by the task.
Email body previews retain their authored colors; QR black/white modules and
image pixels are not transformed. No production business writes were used.

## Operation

One blocking head script and one palette stylesheet, version `20260923-theme1`.
Controls (initial release): public/member navigation, Member Account, personal Admin disclosure,
and both LIVE More menus. `localStorage.e36UnitedAppearance` contains only the
browser preference; storage failure falls back safely. No account/API setting.
No Worker, schema, authorization, prices, polling or business modules changed.

## Screenshot-led polish — theme2

The 11 supplied production screenshots were compared with local real-photo captures.
Structural borders now use the neutral border token at their original declarations,
preserving original dark fallbacks and blue interaction states. Photo overlays no
longer inherit the opaque light glass token in category thumbnails/public gallery.
Decorative years use a separate quiet token; the redundant noninteractive event HUD
and visible Merch rating were removed. Points/benefit calculations are unchanged.
Page/card hierarchy, hero transition, Planner choices/warning, FAQ, route icon,
Member hero/positive status/actions and Admin panels were refined. Thumbnail wrappers
no longer inherit the rounded status-label rule. Lightbox captions retain contrast.

Appearance controls now live in public footers, Member Account, Admin personal
disclosure and LIVE More. The storage key/default/bootstrap behavior is unchanged.
All six entries use `20260923-theme2`; Merch's updated module is also versioned.

Verification: 31 distinct targeted Chromium scenarios passed in component-sized
runs, with no automatic retries. During authoring, two photo checks failed on an
ambiguous close locator (backdrop and button); one gallery check incorrectly expected
the short final section to reach the existing scrollspy threshold. The checks now
use the accessible close button and URL/viewport contract; affected checks passed.
Final refinements were checked only in their affected components. Seven appearance
Node checks (including semantic text contrast >=4.5:1), syntax and diff checks pass.

Opened screenshots include 1440/390 public hero, About, Gallery navigation/media/
upload/lightbox, Merch, all seven Show & Shine choices and expanded judging,
Planner, Member photo header/overpayment/registration/Planner/photo selection,
Admin payment/settings/Member detail and both LIVE interfaces. 360 coverage includes
Show & Shine, Planner and LIVE. Representative dark screens were reviewed.
Screenshots are stored outside the repository in `../appearance-polish-review/`.

Limits: fixture accounts and real repository photos, not production business data.
No actual upload, payment, route-service availability check or production admin write.
External embedded map/video services are blocked by the isolated fixtures; their
CSS treatment and surrounding controls were checked, not external service uptime.
Not an exhaustive matrix of every record/error/photo contrast. No WebKit, full suite
or CI monitoring was performed. Publication uses main's automatic Pages integration.
