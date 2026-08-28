/**
 * types.ts — the vocabulary the whole extension agrees on.
 *
 * Every one of these is a closed literal union rather than `string`. That is
 * deliberate: the safety contract lives in exhaustive handling of `mark`,
 * `substance` and `action`, and a union turns a missed case into a compile
 * error instead of a silently unchecked box.
 */

/** The printed legal mark, as read off the page. Never inferred. */
export type Mark = 'required' | 'optional' | 'absent';

/** What the terms text is actually about, as reported by Claude. */
export type Substance = 'service_essential' | 'marketing' | 'third_party_sharing' | 'unclear';

/** The kind of flow the user is in. Drives S3. */
export type MomentKind = 'signup' | 'payment' | 'entry' | 'reconsent' | 'link' | 'verify' | 'other';

/** Which body of law we judge and accuse under. A property of the page. */
export type Regime = 'kr' | 'intl';

/** Which language we speak to the user. A property of the user. */
export type Locale = 'ko' | 'en';

/** What we do to a checkbox. */
export type Action = 'check' | 'uncheck' | 'leave';

/** Where an item's terms text came from. */
export type TermsSource = 'inline' | 'prefetched' | 'unavailable';

/** A finding about the page, independent of what we did about it. */
export type Flag =
  | 'missing_mark'
  | 'prechecked_optional'
  | 'label_substance_mismatch'
  | 'selectall_violation';

/** Why a decision came out the way it did. */
export type Reason =
  | 'optional_mark'
  | 'no_mark'
  | 'no_mark_proven_essential'
  | 'substance_contradicts_label'
  | 'required_and_service_essential'
  | 'payment_no_auto_check'
  | 'selectall_never_checked'
  | 'selectall_inconsistent'
  | 'selectall_consistent'
  | 'terms_unavailable'
  | 'substance_unclear'
  | 'substance_unknown'
  | 'quote_missing'
  | 'quote_not_verbatim'
  | 'quoted'
  | 'disabled';

/** One consent checkbox, as extracted from the DOM. */
export interface ConsentItem {
  id: string;
  selector: string;
  element: HTMLInputElement;
  labelText: string;
  mark: Mark;
  isSelectAll: boolean;
  checked: boolean;
  disabled: boolean;
  required: boolean;
  termsText: string | null;
  termsUrl: string | null;
  termsSource: TermsSource;
}

/**
 * The part of a ConsentItem a decision actually depends on. `decide()` is
 * documented as DOM-free; this is that promise written as a type, and it is
 * what lets the decision tests run without a DOM at all.
 */
export type DecidableItem = Omit<ConsentItem, 'element' | 'selector' | 'termsUrl' | 'required'>;

/**
 * The part of a ConsentItem the terms prefetcher reads and writes. Like
 * DecidableItem, it keeps a DOM-free module's signature DOM-free.
 */
export type TermsCarrier = Pick<ConsentItem, 'termsText' | 'termsUrl' | 'termsSource'>;

/** One group of consent checkboxes presented together. */
export interface ConsentMoment {
  container: Element;
  items: ConsentItem[];
}

/** Claude's answer for one item, before verification. */
export interface SubstanceReport {
  substance: Substance;
  quote: string | null;
}

/** Verified answers keyed by item id. Partial or empty means degraded (S5). */
export type SubstanceMap = Record<string, SubstanceReport | undefined>;

export interface Decision {
  id: string;
  action: Action;
  reason: Reason;
  flag: Flag | null;
}

export interface Finding {
  id: string;
  labelText: string;
  flag: Flag;
  reason: Reason;
}

/**
 * Every moment except 'other' is scored; 'other' is the absence of a score,
 * so making it a key would invite code that reads a number that never exists.
 */
export type MomentScores = Record<Exclude<MomentKind, 'other'>, number>;

export interface PageContext {
  moment: MomentKind;
  /** Which law this page is judged under. Detected, then overridable. */
  regime: Regime;
  certain: boolean;
  scores: MomentScores;
}

/** Signals `classifyContext` reads. Everything is optional and untrusted. */
export interface ContextSignals {
  url?: string | undefined;
  title?: string | undefined;
  text?: string | undefined;
  /** The document's own `lang`, when it declares one. */
  lang?: string | undefined;
  /** A user's per-domain override, which beats every detected signal. */
  regime?: Regime | undefined;
}
