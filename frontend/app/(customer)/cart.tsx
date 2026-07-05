import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { api } from '@/src/api/client';
import { useCart } from '@/src/context/CartContext';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

export default function Cart() {
  const { items, total, restaurantId, restaurantName, add, remove, clear } = useCart();
  const { t } = useI18n();
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPlace = async () => {
    if (!restaurantId || items.length === 0 || !address) return;
    setPlacing(true);
    setErr(null);
    try {
      const res = await api.post('/orders', {
        restaurant_id: restaurantId,
        items: items.map((i) => ({
          menu_item_id: i.menu_item_id, name: i.name, price: i.price, quantity: i.quantity,
        })),
        delivery_address: address,
        delivery_lat: 41.0082,
        delivery_lng: 28.9784,
        notes,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const orderId = res.data.id;
      clear();
      router.replace(`/(customer)/tracking/${orderId}`);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || t('error'));
    } finally {
      setPlacing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable testID="cart-back-btn" onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('cart')}</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 200 }} keyboardShouldPersistTaps="handled">
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cart-outline" size={64} color={theme.colors.onSurfaceTertiary} />
              <Text style={styles.emptyTxt}>{t('cartEmpty')}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.restName}>{restaurantName}</Text>
              {items.map((i) => (
                <View key={i.menu_item_id} style={styles.item}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{i.name}</Text>
                    <Text style={styles.itemPrice}>₺{(i.price * i.quantity).toFixed(2)}</Text>
                  </View>
                  <View style={styles.qtyRow}>
                    <Pressable
                      testID={`cart-decrement-${i.menu_item_id}`}
                      onPress={() => remove(i.menu_item_id)}
                      style={styles.qtyBtn}
                    ><Ionicons name="remove" size={18} color={theme.colors.onSurface} /></Pressable>
                    <Text style={styles.qty}>{i.quantity}</Text>
                    <Pressable
                      testID={`cart-increment-${i.menu_item_id}`}
                      onPress={() => add(restaurantId!, restaurantName!, {
                        menu_item_id: i.menu_item_id, name: i.name, price: i.price,
                      })}
                      style={styles.qtyBtn}
                    ><Ionicons name="add" size={18} color={theme.colors.onSurface} /></Pressable>
                  </View>
                </View>
              ))}

              <View style={styles.codBox}>
                <Ionicons name="cash-outline" size={22} color={theme.colors.success} />
                <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
                  <Text style={styles.codTitle}>{t('payAtDoor')}</Text>
                  <Text style={styles.codDesc}>{t('payAtDoorDesc')}</Text>
                </View>
              </View>

              <Text style={styles.label}>{t('deliveryAddress')}</Text>
              <TextInput
                testID="cart-address-input"
                style={styles.textInput}
                placeholder={t('deliveryAddress')}
                placeholderTextColor={theme.colors.onSurfaceTertiary}
                value={address}
                onChangeText={setAddress}
                multiline
              />
              <Text style={styles.label}>{t('notes')}</Text>
              <TextInput
                testID="cart-notes-input"
                style={styles.textInput}
                placeholder={t('notes')}
                placeholderTextColor={theme.colors.onSurfaceTertiary}
                value={notes}
                onChangeText={setNotes}
                multiline
              />
              {err && <Text style={styles.err}>{err}</Text>}
            </>
          )}
        </ScrollView>

        {items.length > 0 && (
          <SafeAreaView edges={['bottom']} style={styles.footer}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('total')}</Text>
              <Text style={styles.totalVal}>₺{total.toFixed(2)}</Text>
            </View>
            <Pressable
              testID="place-order-btn"
              onPress={onPlace}
              disabled={placing || !address}
              style={[styles.orderBtn, (!address || placing) && { opacity: 0.5 }]}
            >
              {placing ? <ActivityIndicator color="#fff" /> : <Text style={styles.orderTxt}>{t('placeOrder')}</Text>}
            </Pressable>
          </SafeAreaView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: theme.spacing.lg },
  headerTitle: { fontSize: theme.font.xl, fontWeight: '800', color: theme.colors.onSurface },
  empty: { alignItems: 'center', marginTop: 80, gap: theme.spacing.md },
  emptyTxt: { color: theme.colors.onSurfaceTertiary, fontSize: theme.font.lg },
  restName: { fontSize: theme.font.lg, fontWeight: '700', color: theme.colors.onSurface, marginBottom: theme.spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
  itemName: { fontSize: theme.font.base, fontWeight: '600', color: theme.colors.onSurface },
  itemPrice: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  qty: { fontWeight: '700', fontSize: theme.font.base, minWidth: 20, textAlign: 'center' },
  codBox: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.lg, backgroundColor: '#E8F7EC', borderRadius: theme.radius.md, marginTop: theme.spacing.lg },
  codTitle: { fontWeight: '800', color: theme.colors.onSurface, fontSize: theme.font.base },
  codDesc: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm, marginTop: 2 },
  label: { fontSize: theme.font.sm, color: theme.colors.onSurfaceTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm, fontWeight: '700' },
  textInput: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, padding: theme.spacing.md, fontSize: theme.font.base, color: theme.colors.onSurface, minHeight: 52 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.divider, padding: theme.spacing.lg },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.md },
  totalLabel: { fontSize: theme.font.lg, color: theme.colors.onSurfaceSecondary },
  totalVal: { fontSize: theme.font.xl, fontWeight: '800', color: theme.colors.onSurface },
  orderBtn: { backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill, height: 54, alignItems: 'center', justifyContent: 'center' },
  orderTxt: { color: '#fff', fontSize: theme.font.lg, fontWeight: '700' },
  err: { color: theme.colors.error, marginTop: theme.spacing.md, textAlign: 'center' },
});
