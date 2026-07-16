import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/theme';

interface Props {
  value: number; // 0..5, allow half via rounding
  onChange?: (v: number) => void;
  size?: number;
  readonly?: boolean;
  testID?: string;
}

/**
 * Compact 5-star rating control (whole stars only). Works for both display
 * (readonly) and input (interactive). No half-star support to keep the UI
 * predictable across native + web.
 */
export function StarRating({ value, onChange, size = 28, readonly = false, testID }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  return (
    <View style={styles.row} testID={testID}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable
          key={i}
          testID={`star-${i}`}
          disabled={readonly}
          onPress={() => onChange?.(i)}
          onHoverIn={() => !readonly && setHover(i)}
          onHoverOut={() => setHover(null)}
          style={{ padding: 3 }}
        >
          <Ionicons
            name={i <= shown ? 'star' : 'star-outline'}
            size={size}
            color={i <= shown ? theme.colors.accent : theme.colors.onSurfaceTertiary}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
