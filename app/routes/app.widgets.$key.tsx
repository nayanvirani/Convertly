import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useFetcher, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  FormLayout,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { getShopPlan, getWidgetSettings, setWidgetEnabled, upsertWidgetSettings } from "../db.server";
import {
  blockDeepLink,
  isWidgetKey,
  WIDGET_META,
  type BarSettings,
  type PopupSettings,
  type SatcSettings,
  type TimerSettings,
  type TrustBadge,
  type TrustSettings,
  type WidgetKey,
} from "../widgets";

// ─── Loader / action ────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const key = params.key ?? "";
  if (!isWidgetKey(key)) throw new Response("Not found", { status: 404 });

  const plan = await getShopPlan(session.shop);
  const isPro = plan === "pro";
  const row = await getWidgetSettings(session.shop, key);
  const saved = new URL(request.url).searchParams.get("saved") === "1";
  const shop = session.shop;
  const apiKey = process.env.SHOPIFY_API_KEY || "";

  return json({ key, isPro, enabled: row.enabled, settings: row.settings, saved, shop, apiKey });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const key = params.key ?? "";
  if (!isWidgetKey(key)) throw new Response("Not found", { status: 404 });

  if (WIDGET_META[key].proOnly) {
    const plan = await getShopPlan(session.shop);
    if (plan !== "pro") {
      return json({ ok: false, message: "Upgrade to Pro to configure this widget." }, { status: 403 });
    }
  }

  const form = await request.formData();

  // Instant-save toggle from the dashboard/settings-page switch — separate
  // from the full settings form below, and deliberately explicit
  // ("true"/"false" sent directly by JS) rather than relying on a checkbox's
  // presence-or-absence in the form body, so there's no ambiguity about
  // what got submitted.
  if (form.get("intent") === "toggle") {
    const enabled = form.get("enabled") === "true";
    try {
      await setWidgetEnabled(session.shop, key, enabled);
    } catch {
      return json({ ok: false, message: "Couldn't save — try again." }, { status: 500 });
    }
    return json({ ok: true, enabled });
  }

  const num = (name: string, fallback: number) => {
    const v = Number(form.get(name));
    return Number.isFinite(v) ? v : fallback;
  };
  const str = (name: string, fallback = "") => String(form.get(name) ?? fallback);

  let settings: unknown;
  switch (key) {
    case "bar": {
      const s: BarSettings = {
        messages: [str("msg1"), str("msg2"), str("msg3")].filter(Boolean),
        rotateSeconds: num("rotateSeconds", 5),
        ctaText: str("ctaText"),
        ctaLink: str("ctaLink"),
        bgColor: str("bgColor", "#1a1a2e"),
        textColor: str("textColor", "#ffffff"),
        fontSize: num("fontSize", 14),
        position: str("position", "top") === "bottom" ? "bottom" : "top",
        // Polaris's <Checkbox> never gets a `value` prop from us, and
        // React's controlled-input handling defaults that to an empty
        // string rather than the browser's native "on" default for an
        // unspecified checkbox value — so checking for the literal string
        // "on" here could never actually match. A checkbox's presence in
        // the submitted data is the reliable signal either way: browsers
        // omit unchecked checkboxes from form data entirely, regardless of
        // what value string is attached to a checked one.
        sticky: form.has("sticky"),
        dismissible: form.has("dismissible"),
      };
      settings = s;
      break;
    }
    case "timer": {
      const s: TimerSettings = {
        label: str("label", "Sale ends in"),
        mode: str("mode", "fixed") === "evergreen" ? "evergreen" : "fixed",
        endDate: str("endDate", "2026-12-31"),
        endTime: str("endTime", "23:59"),
        evergreenMinutes: num("evergreenMinutes", 30),
        expiredAction: str("expiredAction", "hide") === "message" ? "message" : "hide",
        expiredText: str("expiredText", "Offer has ended"),
        bgColor: str("bgColor", "#fff3f0"),
        textColor: str("textColor", "#c1121f"),
      };
      settings = s;
      break;
    }
    case "trust": {
      const badges: TrustBadge[] = [];
      for (let i = 1; i <= 6; i++) {
        const text = str(`badgeText${i}`);
        const icon = str(`badgeIcon${i}`);
        if (text) badges.push({ text, icon });
      }
      const layout = str("layout", "horizontal");
      const mobileLayout = str("mobileLayout", "same");
      const s: TrustSettings = {
        layout: layout === "vertical" || layout === "scroll" ? layout : "horizontal",
        mobileLayout:
          mobileLayout === "horizontal" || mobileLayout === "vertical" || mobileLayout === "scroll"
            ? mobileLayout
            : "same",
        scrollSpeed: num("scrollSpeed", 20),
        iconSize: num("iconSize", 20),
        color: str("color", "#333333"),
        badges,
      };
      settings = s;
      break;
    }
    case "satc": {
      const s: SatcSettings = {
        btnText: str("btnText", "Add to cart"),
        btnColor: str("btnColor", "#111111"),
        afterAdd: str("afterAdd", "stay") === "cart" ? "cart" : "stay",
      };
      settings = s;
      break;
    }
    case "popup": {
      const s: PopupSettings = {
        collection: str("collection", "all"),
        eyebrow: str("eyebrow", "🔥 Popular right now"),
        accentColor: str("accentColor", "#c1121f"),
        firstDelay: num("firstDelay", 8),
        showSeconds: num("showSeconds", 5),
        gapSeconds: num("gapSeconds", 25),
        maxPopups: num("maxPopups", 4),
      };
      settings = s;
      break;
    }
  }

  try {
    await upsertWidgetSettings(session.shop, key, settings as never);
  } catch {
    // Keep the merchant on this page with their just-submitted values
    // still visible (see settingsOverride below) instead of a hard 500
    // that discards the edit and looks exactly like "my changes didn't
    // save" — because until now, that's exactly what a transient DB
    // hiccup here actually did.
    return json({ ok: false, message: "Couldn't save your changes — please try again.", settings }, { status: 500 });
  }
  return redirect(`/app/widgets/${key}?saved=1`);
}

// ─── UI ─────────────────────────────────────────────────────────────────────

export default function WidgetSettings() {
  const { key, isPro, enabled, settings, saved, shop, apiKey } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const saving = nav.state === "submitting";
  const meta = WIDGET_META[key as WidgetKey];
  const locked = meta.proOnly && !isPro;
  const blockUrl = !locked ? blockDeepLink(shop, apiKey, key as WidgetKey) : null;

  return (
    <Page title={`${meta.emoji} ${meta.name}`} subtitle={meta.desc} backAction={{ url: "/app" }}>
      <BlockStack gap="400">
        {locked && (
          <Banner tone="warning" title="Pro plan required">
            <Button url="/app/billing">Upgrade to Pro</Button>
          </Banner>
        )}
        {blockUrl && (
          <Banner tone="warning" title="Needs a block placed in your theme">
            <BlockStack gap="200">
              <Text as="p">
                Turning this on above isn&apos;t enough — {meta.name} only renders where you
                place its block in the theme editor.
              </Text>
              <Button url={blockUrl} target="_blank">Place block in theme</Button>
            </BlockStack>
          </Banner>
        )}
        {saved && !actionData && (
          <Banner tone="success">Settings saved.</Banner>
        )}
        {actionData && "message" in actionData && (
          <Banner tone="critical">{actionData.message}</Banner>
        )}

        {/* Its own instant-save control — checking/unchecking this posts
            immediately (see the "toggle" intent in the action) and shows
            its own confirmation, entirely independent of the Save button
            below. No more "did I remember to click Save" ambiguity for the
            one field that matters most. Keyed by widget so switching
            between widget pages always starts from a clean, un-stale
            fetcher state. */}
        <EnabledToggle key={key} widgetKey={key as WidgetKey} meta={meta} enabled={enabled} locked={locked} />

        {/* On a failed save, redisplay exactly what the merchant just typed
            (carried back on actionData) instead of falling back to the
            last-saved settings from the loader — otherwise a DB hiccup
            both fails the save AND silently reverts the form, compounding
            "my changes didn't save" with "and now I have to retype them." */}
        {(() => {
          const displaySettings =
            actionData && "settings" in actionData ? actionData.settings : settings;
          return (
            // Keyed by the actual loaded data so every field below remounts
            // fresh whenever the server's data changes, instead of Remix
            // reusing the same component instance across the Save →
            // redirect → reload cycle and leaving stale values on screen.
            <SettingsForm
              key={JSON.stringify({ enabled, displaySettings })}
              widgetKey={key as WidgetKey}
              settings={displaySettings}
              locked={locked}
              saving={saving}
            />
          );
        })()}
      </BlockStack>
    </Page>
  );
}

function EnabledToggle({
  widgetKey,
  meta,
  enabled,
  locked,
}: {
  widgetKey: WidgetKey;
  meta: (typeof WIDGET_META)[WidgetKey];
  enabled: boolean;
  locked: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  // Prefer this toggle's own fetch result the instant it lands — don't wait
  // for the full-page loader to catch up (it will, in the background, via
  // Remix's automatic revalidation after a fetcher submission).
  const current = fetcher.data && "enabled" in fetcher.data ? fetcher.data.enabled : enabled;
  const busy = fetcher.state !== "idle";
  const failed = fetcher.data && "ok" in fetcher.data && fetcher.data.ok === false;

  function toggle(next: boolean) {
    fetcher.submit({ intent: "toggle", enabled: String(next) }, { method: "post" });
  }

  return (
    <Card>
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="050">
          <Text as="h3" variant="bodyMd" fontWeight="semibold">
            {current ? "Enabled — live on your storefront" : "Disabled"}
          </Text>
          <Text as="p" variant="bodySm" tone={failed ? "critical" : "subdued"}>
            {failed
              ? "message" in (fetcher.data as any) ? (fetcher.data as any).message : "Couldn't save — try again."
              : busy
                ? "Saving…"
                : "Saves instantly — this switch doesn't need the Save button below."}
          </Text>
        </BlockStack>
        <Checkbox
          label={`${meta.name} enabled`}
          labelHidden
          checked={current}
          onChange={toggle}
          disabled={locked || busy}
        />
      </InlineStack>
    </Card>
  );
}

function SettingsForm({
  widgetKey,
  settings,
  locked,
  saving,
}: {
  widgetKey: WidgetKey;
  settings: unknown;
  locked: boolean;
  saving: boolean;
}) {
  return (
    <Card>
      <Form method="post">
        <BlockStack gap="400">
          {widgetKey === "bar" && <BarFields settings={settings as BarSettings} disabled={locked} />}
          {widgetKey === "timer" && <TimerFields settings={settings as TimerSettings} disabled={locked} />}
          {widgetKey === "trust" && <TrustFields settings={settings as TrustSettings} disabled={locked} />}
          {widgetKey === "satc" && <SatcFields settings={settings as SatcSettings} disabled={locked} />}
          {widgetKey === "popup" && <PopupFields settings={settings as PopupSettings} disabled={locked} />}

          <InlineStack align="end">
            <Button submit variant="primary" loading={saving} disabled={locked}>
              Save
            </Button>
          </InlineStack>
        </BlockStack>
      </Form>
    </Card>
  );
}

// ─── Per-widget field groups ────────────────────────────────────────────────
// Polaris form controls are fully controlled (no defaultValue/defaultChecked),
// so each group keeps its own local state seeded from the loaded settings.
// The `name` attribute on each control is still what the plain <Form method
//="post"> submits — React just owns the displayed value along the way.

function useField<T>(initial: T) {
  const [value, setValue] = useState(initial);
  return [value, setValue] as const;
}

// A plain hex TextField alone left merchants guessing at a value with no
// visual feedback — this pairs it with a real color-picker swatch. The
// swatch has no `name` of its own; it just writes into the same state as
// the text field, which stays the one thing actually submitted, so typing
// a hex code and using the picker are two ways of setting one value, never
// two competing form fields.
function ColorField({
  label,
  name,
  value,
  onChange,
  disabled,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  // <input type="color"> only accepts strict #rrggbb — fall back to a
  // neutral swatch value while the text field holds anything else (e.g.
  // mid-edit, shorthand #fff, or empty), so the picker never throws.
  const swatchValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
      <div style={{ flex: 1 }}>
        <TextField label={label} name={name} value={value} onChange={onChange} autoComplete="off" disabled={disabled} />
      </div>
      <input
        type="color"
        aria-label={`Pick ${label.toLowerCase()}`}
        value={swatchValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: "36px",
          height: "36px",
          padding: "2px",
          border: "1px solid #c9cccf",
          borderRadius: "6px",
          background: "#fff",
          cursor: disabled ? "default" : "pointer",
          flexShrink: 0,
        }}
      />
    </div>
  );
}

function BarFields({ settings: s, disabled }: { settings: BarSettings; disabled: boolean }) {
  const [msg1, setMsg1] = useField(s.messages[0] ?? "");
  const [msg2, setMsg2] = useField(s.messages[1] ?? "");
  const [msg3, setMsg3] = useField(s.messages[2] ?? "");
  const [rotateSeconds, setRotateSeconds] = useField(String(s.rotateSeconds));
  const [ctaText, setCtaText] = useField(s.ctaText);
  const [ctaLink, setCtaLink] = useField(s.ctaLink);
  const [bgColor, setBgColor] = useField(s.bgColor);
  const [textColor, setTextColor] = useField(s.textColor);
  const [fontSize, setFontSize] = useField(String(s.fontSize));
  const [position, setPosition] = useField<string>(s.position);
  const [sticky, setSticky] = useField(s.sticky);
  const [dismissible, setDismissible] = useField(s.dismissible);

  return (
    <FormLayout>
      <TextField label="Message 1" name="msg1" value={msg1} onChange={setMsg1} autoComplete="off" disabled={disabled} />
      <TextField label="Message 2 (optional)" name="msg2" value={msg2} onChange={setMsg2} autoComplete="off" disabled={disabled} />
      <TextField label="Message 3 (optional)" name="msg3" value={msg3} onChange={setMsg3} autoComplete="off" disabled={disabled} />
      <TextField label="Seconds per message" name="rotateSeconds" type="number" value={rotateSeconds} onChange={setRotateSeconds} autoComplete="off" disabled={disabled} />
      <FormLayout.Group>
        <TextField label="Button text (optional)" name="ctaText" value={ctaText} onChange={setCtaText} autoComplete="off" disabled={disabled} />
        <TextField label="Button link" name="ctaLink" value={ctaLink} onChange={setCtaLink} autoComplete="off" disabled={disabled} />
      </FormLayout.Group>
      <FormLayout.Group>
        <ColorField label="Background color" name="bgColor" value={bgColor} onChange={setBgColor} disabled={disabled} />
        <ColorField label="Text color" name="textColor" value={textColor} onChange={setTextColor} disabled={disabled} />
        <TextField label="Font size (px)" name="fontSize" type="number" value={fontSize} onChange={setFontSize} autoComplete="off" disabled={disabled} />
      </FormLayout.Group>
      <Select
        label="Position"
        name="position"
        options={[{ label: "Top of page", value: "top" }, { label: "Bottom of page", value: "bottom" }]}
        value={position}
        onChange={setPosition}
        disabled={disabled}
      />
      <Checkbox label="Stick while scrolling" name="sticky" checked={sticky} onChange={setSticky} disabled={disabled} />
      <Checkbox label="Show close button" name="dismissible" checked={dismissible} onChange={setDismissible} disabled={disabled} />
    </FormLayout>
  );
}

function TimerFields({ settings: s, disabled }: { settings: TimerSettings; disabled: boolean }) {
  const [label, setLabel] = useField(s.label);
  const [mode, setMode] = useField<string>(s.mode);
  const [endDate, setEndDate] = useField(s.endDate);
  const [endTime, setEndTime] = useField(s.endTime);
  const [evergreenMinutes, setEvergreenMinutes] = useField(String(s.evergreenMinutes));
  const [expiredAction, setExpiredAction] = useField<string>(s.expiredAction);
  const [expiredText, setExpiredText] = useField(s.expiredText);
  const [bgColor, setBgColor] = useField(s.bgColor);
  const [textColor, setTextColor] = useField(s.textColor);

  return (
    <FormLayout>
      <TextField label="Label" name="label" value={label} onChange={setLabel} autoComplete="off" disabled={disabled} />
      <Select
        label="Timer type"
        name="mode"
        options={[
          { label: "Fixed end date (same for everyone)", value: "fixed" },
          { label: "Evergreen (restarts per visitor)", value: "evergreen" },
        ]}
        value={mode}
        onChange={setMode}
        disabled={disabled}
      />
      <FormLayout.Group>
        <TextField label="End date (YYYY-MM-DD)" name="endDate" value={endDate} onChange={setEndDate} autoComplete="off" disabled={disabled} />
        <TextField label="End time (HH:MM, 24h)" name="endTime" value={endTime} onChange={setEndTime} autoComplete="off" disabled={disabled} />
        <TextField label="Evergreen duration (minutes)" name="evergreenMinutes" type="number" value={evergreenMinutes} onChange={setEvergreenMinutes} autoComplete="off" disabled={disabled} />
      </FormLayout.Group>
      <Select
        label="When timer ends"
        name="expiredAction"
        options={[{ label: "Hide the timer", value: "hide" }, { label: "Show a message", value: "message" }]}
        value={expiredAction}
        onChange={setExpiredAction}
        disabled={disabled}
      />
      <TextField label="Expired message" name="expiredText" value={expiredText} onChange={setExpiredText} autoComplete="off" disabled={disabled} />
      <FormLayout.Group>
        <ColorField label="Background color" name="bgColor" value={bgColor} onChange={setBgColor} disabled={disabled} />
        <ColorField label="Text color" name="textColor" value={textColor} onChange={setTextColor} disabled={disabled} />
      </FormLayout.Group>
    </FormLayout>
  );
}

function TrustFields({ settings: s, disabled }: { settings: TrustSettings; disabled: boolean }) {
  const initialBadges = [0, 1, 2, 3, 4, 5].map((i) => s.badges[i] ?? { text: "", icon: "" });
  const [badges, setBadges] = useField(initialBadges);
  const [layout, setLayout] = useField<string>(s.layout);
  const [mobileLayout, setMobileLayout] = useField<string>(s.mobileLayout);
  const [scrollSpeed, setScrollSpeed] = useField(String(s.scrollSpeed));
  const [iconSize, setIconSize] = useField(String(s.iconSize));
  const [color, setColor] = useField(s.color);

  const updateBadge = (i: number, patch: Partial<TrustBadge>) => {
    setBadges(badges.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  };

  return (
    <FormLayout>
      <FormLayout.Group>
        <Select
          label="Desktop layout"
          name="layout"
          options={[
            { label: "Horizontal (wrap)", value: "horizontal" },
            { label: "Vertical list", value: "vertical" },
            { label: "Infinite scroll ticker", value: "scroll" },
          ]}
          value={layout}
          onChange={setLayout}
          disabled={disabled}
        />
        <Select
          label="Mobile layout"
          name="mobileLayout"
          options={[
            { label: "Same as desktop", value: "same" },
            { label: "Horizontal (wrap)", value: "horizontal" },
            { label: "Vertical list", value: "vertical" },
            { label: "Infinite scroll ticker", value: "scroll" },
          ]}
          value={mobileLayout}
          onChange={setMobileLayout}
          disabled={disabled}
        />
        <TextField label="Scroll speed (seconds)" name="scrollSpeed" type="number" value={scrollSpeed} onChange={setScrollSpeed} autoComplete="off" disabled={disabled} />
      </FormLayout.Group>
      <Text as="h3" variant="headingSm">Badges (up to 6 — leave text blank to skip)</Text>
      {badges.map((b, i) => (
        <FormLayout.Group key={i}>
          <TextField
            label={`Badge ${i + 1} text`}
            name={`badgeText${i + 1}`}
            value={b.text}
            onChange={(v) => updateBadge(i, { text: v })}
            autoComplete="off"
            disabled={disabled}
          />
          <TextField
            label={`Badge ${i + 1} icon URL (optional)`}
            name={`badgeIcon${i + 1}`}
            value={b.icon}
            onChange={(v) => updateBadge(i, { icon: v })}
            autoComplete="off"
            disabled={disabled}
            helpText="Leave blank for the default checkmark icon"
          />
        </FormLayout.Group>
      ))}
      <FormLayout.Group>
        <TextField label="Icon size (px)" name="iconSize" type="number" value={iconSize} onChange={setIconSize} autoComplete="off" disabled={disabled} />
        <ColorField label="Text color" name="color" value={color} onChange={setColor} disabled={disabled} />
      </FormLayout.Group>
    </FormLayout>
  );
}

function SatcFields({ settings: s, disabled }: { settings: SatcSettings; disabled: boolean }) {
  const [btnText, setBtnText] = useField(s.btnText);
  const [btnColor, setBtnColor] = useField(s.btnColor);
  const [afterAdd, setAfterAdd] = useField<string>(s.afterAdd);

  return (
    <FormLayout>
      <FormLayout.Group>
        <TextField label="Button text" name="btnText" value={btnText} onChange={setBtnText} autoComplete="off" disabled={disabled} />
        <ColorField label="Button color" name="btnColor" value={btnColor} onChange={setBtnColor} disabled={disabled} />
      </FormLayout.Group>
      <Select
        label="After adding to cart"
        name="afterAdd"
        options={[
          { label: "Stay on page (show confirmation)", value: "stay" },
          { label: "Go to cart page", value: "cart" },
        ]}
        value={afterAdd}
        onChange={setAfterAdd}
        disabled={disabled}
      />
    </FormLayout>
  );
}

function PopupFields({ settings: s, disabled }: { settings: PopupSettings; disabled: boolean }) {
  const [collection, setCollection] = useField(s.collection);
  const [eyebrow, setEyebrow] = useField(s.eyebrow);
  const [accentColor, setAccentColor] = useField(s.accentColor);
  const [firstDelay, setFirstDelay] = useField(String(s.firstDelay));
  const [showSeconds, setShowSeconds] = useField(String(s.showSeconds));
  const [gapSeconds, setGapSeconds] = useField(String(s.gapSeconds));
  const [maxPopups, setMaxPopups] = useField(String(s.maxPopups));

  return (
    <FormLayout>
      <TextField
        label="Collection handle"
        name="collection"
        value={collection}
        onChange={setCollection}
        autoComplete="off"
        disabled={disabled}
        helpText="The part after /collections/ in the URL — e.g. 'best-sellers'. Leave as 'all' for the whole catalog."
      />
      <FormLayout.Group>
        <TextField label="Popup label" name="eyebrow" value={eyebrow} onChange={setEyebrow} autoComplete="off" disabled={disabled} />
        <ColorField label="Label color" name="accentColor" value={accentColor} onChange={setAccentColor} disabled={disabled} />
      </FormLayout.Group>
      <FormLayout.Group>
        <TextField label="First popup after (seconds)" name="firstDelay" type="number" value={firstDelay} onChange={setFirstDelay} autoComplete="off" disabled={disabled} />
        <TextField label="Show each popup for (seconds)" name="showSeconds" type="number" value={showSeconds} onChange={setShowSeconds} autoComplete="off" disabled={disabled} />
        <TextField label="Gap between popups (seconds)" name="gapSeconds" type="number" value={gapSeconds} onChange={setGapSeconds} autoComplete="off" disabled={disabled} />
        <TextField label="Max popups per visit" name="maxPopups" type="number" value={maxPopups} onChange={setMaxPopups} autoComplete="off" disabled={disabled} />
      </FormLayout.Group>
    </FormLayout>
  );
}
