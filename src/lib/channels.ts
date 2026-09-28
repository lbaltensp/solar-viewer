/**
 * SDO/AIA wavelength channels and their Helioviewer source ids.
 *
 * Helioviewer identifies every instrument channel by a numeric `sourceId`.
 * The AIA ids are stable and documented at https://api.helioviewer.org/docs/v2/
 * (getDataSources). Colours are the standard AIA colour tables, approximated
 * as a single accent colour for UI use.
 */

export interface Channel {
  /** Wavelength in Ångström, also used as the URL key (e.g. /api/frame/171/...). */
  wavelength: number;
  /** Helioviewer data source id. */
  sourceId: number;
  /** Display name. */
  name: string;
  /** What the channel shows, for tooltips. */
  description: string;
  /** Approximate characteristic temperature in K. */
  temperatureK: number;
  /** UI accent colour approximating the AIA colour table. */
  accent: string;
}

export const CHANNELS: readonly Channel[] = [
  { wavelength: 94, sourceId: 8, name: "AIA 94", description: "Flaring regions, Fe XVIII", temperatureK: 6.3e6, accent: "#6bc46b" },
  { wavelength: 131, sourceId: 9, name: "AIA 131", description: "Flaring regions, Fe VIII / XXI", temperatureK: 1e7, accent: "#4fc3c3" },
  { wavelength: 171, sourceId: 10, name: "AIA 171", description: "Quiet corona, upper transition region, Fe IX", temperatureK: 6.3e5, accent: "#e8b84a" },
  { wavelength: 193, sourceId: 11, name: "AIA 193", description: "Corona and hot flare plasma, Fe XII / XXIV", temperatureK: 1.2e6, accent: "#d9a066" },
  { wavelength: 211, sourceId: 12, name: "AIA 211", description: "Active-region corona, Fe XIV", temperatureK: 2e6, accent: "#b98ad6" },
  { wavelength: 304, sourceId: 13, name: "AIA 304", description: "Chromosphere and transition region, He II", temperatureK: 5e4, accent: "#e0603a" },
  { wavelength: 335, sourceId: 14, name: "AIA 335", description: "Active-region corona, Fe XVI", temperatureK: 2.5e6, accent: "#4f7fd6" },
  { wavelength: 1600, sourceId: 15, name: "AIA 1600", description: "Transition region and upper photosphere, C IV", temperatureK: 1e5, accent: "#d6c98a" },
  { wavelength: 1700, sourceId: 16, name: "AIA 1700", description: "Temperature minimum, photosphere", temperatureK: 5e3, accent: "#e8a0c8" },
] as const;

export const DEFAULT_WAVELENGTH = 171;

const byWavelength = new Map<number, Channel>(CHANNELS.map((c) => [c.wavelength, c]));

/** Look up a channel by wavelength. Returns undefined for unknown values. */
export function getChannel(wavelength: number): Channel | undefined {
  return byWavelength.get(wavelength);
}

/**
 * Parse a channel from user input such as a URL segment or query value.
 * Accepts "171", "0171", "aia171" style strings. Returns undefined if invalid.
 */
export function parseChannel(input: string | null | undefined): Channel | undefined {
  if (!input) return undefined;
  const digits = input.replace(/[^0-9]/g, "");
  if (!digits) return undefined;
  return getChannel(Number.parseInt(digits, 10));
}
