import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Switch } from 'react-native';
import { theme } from '@/src/theme';

export const WEEKDAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DaySlot {
  closed: boolean;
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}

export type HoursMap = Record<DayKey, DaySlot>;

export const DEFAULT_HOURS: HoursMap = {
  mon: { closed: false, open: '09:00', close: '22:00' },
  tue: { closed: false, open: '09:00', close: '22:00' },
  wed: { closed: false, open: '09:00', close: '22:00' },
  thu: { closed: false, open: '09:00', close: '22:00' },
  fri: { closed: false, open: '09:00', close: '22:00' },
  sat: { closed: false, open: '09:00', close: '22:00' },
  sun: { closed: false, open: '09:00', close: '22:00' },
};

const HHMM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
export function isValidHHMM(v: string) { return HHMM_RE.test(v); }

export function normalizeHours(input: any): HoursMap {
  if (!input) return { ...DEFAULT_HOURS };
  const out: HoursMap = { ...DEFAULT_HOURS };
  for (const { key } of WEEKDAYS) {
    const s = input[key];
    if (s && typeof s === 'object') {
      out[key] = {
        closed: !!s.closed,
        open: typeof s.open === 'string' ? s.open : '09:00',
        close: typeof s.close === 'string' ? s.close : '22:00',
      };
    }
  }
  return out;
}

interface Props {
  value: HoursMap;
  onChange: (next: HoursMap) => void;
}

/** Editor for a weekly opening-hours schedule. Includes an "Apply Mon to all days" shortcut. */
export function HoursEditor({ value, onChange }: Props) {
  const update = (day: DayKey, patch: Partial<DaySlot>) => {
    onChange({ ...value, [day]: { ...value[day], ...patch } });
  };
  const applyMonToAll = () => {
    const base = value.mon;
    const next: HoursMap = { ...value };
    for (const { key } of WEEKDAYS) next[key] = { ...base };
    onChange(next);
  };
  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>Weekly hours</Text>
        <Pressable onPress={applyMonToAll} testID="apply-mon-to-all">
          <Text style={styles.applyBtn}>Apply Mon to all days</Text>
        </Pressable>
      </View>
      {WEEKDAYS.map(({ key, label }) => {
        const s = value[key];
        const openInvalid = !s.closed && !isValidHHMM(s.open);
        const closeInvalid = !s.closed && !isValidHHMM(s.close);
        return (
          <View key={key} style={styles.dayRow} testID={`hours-row-${key}`}>
            <Text style={styles.dayLabel}>{label}</Text>
            <View style={styles.toggleWrap}>
              <Switch
                testID={`hours-open-toggle-${key}`}
                value={!s.closed}
                onValueChange={(open) => update(key, { closed: !open })}
                trackColor={{ false: theme.colors.surfaceTertiary, true: theme.colors.brand }}
              />
              <Text style={styles.toggleLabel}>{s.closed ? 'Closed' : 'Open'}</Text>
            </View>
            {!s.closed && (
              <View style={styles.timeWrap}>
                <TextInput
                  testID={`hours-open-${key}`}
                  style={[styles.timeInput, openInvalid && styles.invalidInput]}
                  value={s.open}
                  onChangeText={(v) => update(key, { open: v })}
                  placeholder="09:00"
                  placeholderTextColor={theme.colors.onSurfaceTertiary}
                  maxLength={5}
                  autoCapitalize="none"
                />
                <Text style={styles.dash}>–</Text>
                <TextInput
                  testID={`hours-close-${key}`}
                  style={[styles.timeInput, closeInvalid && styles.invalidInput]}
                  value={s.close}
                  onChangeText={(v) => update(key, { close: v })}
                  placeholder="22:00"
                  placeholderTextColor={theme.colors.onSurfaceTertiary}
                  maxLength={5}
                  autoCapitalize="none"
                />
              </View>
            )}
          </View>
        );
      })}
      <Text style={styles.hint}>24-hour format · e.g. 09:00 – 22:00. Ranges past midnight are supported.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm },
  headerLabel: { fontSize: theme.font.sm, fontWeight: '700', color: theme.colors.onSurfaceSecondary, textTransform: 'uppercase' },
  applyBtn: { color: theme.colors.brand, fontWeight: '700', fontSize: theme.font.sm },
  dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: theme.spacing.sm, flexWrap: 'wrap' },
  dayLabel: { width: 40, fontWeight: '700', color: theme.colors.onSurface },
  toggleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 100 },
  toggleLabel: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, fontWeight: '600' },
  timeWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
  timeInput: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm, paddingVertical: 6, minWidth: 66, textAlign: 'center',
    color: theme.colors.onSurface,
  },
  invalidInput: { borderColor: theme.colors.error },
  dash: { color: theme.colors.onSurfaceSecondary, fontWeight: '700' },
  hint: { color: theme.colors.onSurfaceTertiary, fontSize: theme.font.xs, marginTop: theme.spacing.sm },
});
