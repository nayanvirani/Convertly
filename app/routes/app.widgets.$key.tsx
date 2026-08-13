import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
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
import { getShopPlan, getWidgetSettings, upsertWidgetSettings } from "../db.server";
import {
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

  return json({ key, isPro, enabled: row.enabled, settings: row.settings });
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
  const enabled = form.get("enabled") === "on";
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
        sticky: form.get("sticky") === "on",
        dismissible: form.get("dismissible") === "on",
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
        anchorSelector: str("anchorSelector"),
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
        anchorSelector: str("anchorSelector"),
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

  await upsertWidgetSettings(session.shop, key, enabled, settings as never);
  return redirect(`/app/widgets/${key}?saved=1`);
}

// ─── UI ─────────────────────────────────────────────────────────────────────

export default function WidgetSettings() {
  const { key, isPro, enabled, settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const saving = nav.state === "submitting";
  const meta = WIDGET_META[key as WidgetKey];
  const locked = meta.proOnly && !isPro;

  const [isEnabled, setIsEnabled] = useState(enabled);

  return (
    <Page title={`${meta.emoji} ${meta.name}`} backAction={{ url: "/app" }}>
      <BlockStack gap="400">
        {locked && (
          <Banner tone="warning" title="Pro plan required">
            <Button url="/app/billing">Upgrade to Pro</Button>
          </Banner>
        )}
        {actionData && "message" in actionData && (
          <Banner tone="critical">{actionData.message}</Banner>
        )}

        <Card>
          <Form method="post">
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">{meta.desc}</Text>
                <Checkbox
                  label="Enabled"
                  checked={isEnabled}
                  onChange={setIsEnabled}
                  name="enabled"
                  disabled={locked}
                />
              </InlineStack>

              {key === "bar" && <BarFields settings={settings as BarSettings} disabled={locked} />}
              {key === "timer" && <TimerFields settings={settings as TimerSettings} disabled={locked} />}
              {key === "trust" && <TrustFields settings={settings as TrustSettings} disabled={locked} />}
              {key === "satc" && <SatcFields settings={settings as SatcSettings} disabled={locked} />}
              {key === "popup" && <PopupFields settings={settings as PopupSettings} disabled={locked} />}

              <InlineStack align="end">
                <Button submit variant="primary" loading={saving} disabled={locked}>
                  Save
                </Button>
              </InlineStack>
            </BlockStack>
          </Form>
        </Card>
      </BlockStack>
    </Page>
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
        <TextField label="Background color" name="bgColor" value={bgColor} onChange={setBgColor} autoComplete="off" disabled={disabled} />
        <TextField label="Text color" name="textColor" value={textColor} onChange={setTextColor} autoComplete="off" disabled={disabled} />
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
  const [anchorSelector, setAnchorSelector] = useField(s.anchorSelector);

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
        <TextField label="Background color" name="bgColor" value={bgColor} onChange={setBgColor} autoComplete="off" disabled={disabled} />
        <TextField label="Text color" name="textColor" value={textColor} onChange={setTextColor} autoComplete="off" disabled={disabled} />
      </FormLayout.Group>
      <TextField
        label="Placement override (CSS selector, optional)"
        name="anchorSelector"
        value={anchorSelector}
        onChange={setAnchorSelector}
        autoComplete="off"
        disabled={disabled}
        helpText="Timer is placed right after the buy-now form by default. Only set this if it lands in the wrong spot on your theme."
      />
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
  const [anchorSelector, setAnchorSelector] = useField(s.anchorSelector);

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
        <TextField label="Text color" name="color" value={color} onChange={setColor} autoComplete="off" disabled={disabled} />
      </FormLayout.Group>
      <TextField
        label="Placement override (CSS selector, optional)"
        name="anchorSelector"
        value={anchorSelector}
        onChange={setAnchorSelector}
        autoComplete="off"
        disabled={disabled}
        helpText="Badges are placed right after the buy-now form by default. Only set this if it lands in the wrong spot on your theme."
      />
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
        <TextField label="Button color" name="btnColor" value={btnColor} onChange={setBtnColor} autoComplete="off" disabled={disabled} />
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
        <TextField label="Label color" name="accentColor" value={accentColor} onChange={setAccentColor} autoComplete="off" disabled={disabled} />
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
