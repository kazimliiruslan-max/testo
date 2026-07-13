import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { api, saveToken } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { useCart } from '@/src/context/CartContext';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';
import LocationPicker, { PickedLocation } from '@/src/components/LocationPicker';

interface SavedAddress {
  id: string; label: string; address: string; extra: string; lat: number; lng: number;
}

export default function Cart() {
  const { user, refresh } = useAuth();
  const { items, total, restaurantId, restaurantName, add, remove, clear } = useCart();
  const { t } = useI18n();
  const router = useRouter();
  const [pickedLoc, setPickedLoc] = useState<PickedLocation | null>(null);
  const [addressExtra, setAddressExtra] = useState('');
  const [notes, setNotes] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [saveLabel, setSaveLabel] = useState<string | null>(null); // null means don't save
  const [minOrderValue, setMinOrderValue] = useState(0);
  // Guest fields
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [password, setPassword] = useState('');
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isGuest = !user;
  const fullAddress = pickedLoc ? `${pickedLoc.address}${addressExtra ? ` — ${addressExtra}` : ''}` : '';
  const meetsMinOrder = minOrderValue <= 0 || total >= minOrderValue;
  const canPlace = !!pickedLoc && meetsMinOrder && (!isGuest || (name && email && phone && password));

  useEffect(() => {
    if (restaurantId) {
      api.get(`/restaurants/${restaurantId}`)
        .then((r) => setMinOrderValue(Number(r.data?.min_order_value || 0)))
        .catch(() => setMinOrderValue(0));
    }
  }, [restaurantId]);

  useEffect(() => {
    if (user?.role === 'customer') {
      api.get('/addresses').then((r) => setSavedAddresses(r.data)).catch(() => {});
    } else {
      setSavedAddresses([]);
    }
  }, [user]);

  const applySaved = (a: SavedAddress) => {
    setPickedLoc({ lat: a.lat, lng: a.lng, address: a.address });
    setAddressExtra(a.extra || '');
  };

  const onPlace = async () => {
    if (!restaurantId || items.length === 0 || !pickedLoc) return;
    if (isGuest && (!name || !email || !phone || !password)) {
      setErr('Please fill in your details');
      return;
    }
    setPlacing(true);
    setErr(null);
    try {
      let orderId: string;
      if (isGuest) {
        const res = await api.post('/orders/guest', {
          name, email, phone, password,
          restaurant_id: restaurantId,
          items: items.map((i) => ({
            menu_item_id: i.menu_item_id, name: i.name, price: i.price, quantity: i.quantity,
          })),
          delivery_address: fullAddress,
          delivery_lat: pickedLoc.lat,
          delivery_lng: pickedLoc.lng,
          notes,
        });
        await saveToken(res.data.access_token);
        await refresh();
        const list = await api.get('/orders');
        orderId = list.data[0].id;
      } else {
        const res = await api.post('/orders', {
          restaurant_id: restaurantId,
          items: items.map((i) => ({
            menu_item_id: i.menu_item_id, name: i.name, price: i.price, quantity: i.quantity,
          })),
          delivery_address: fullAddress,
          delivery_lat: pickedLoc.lat,
          delivery_lng: pickedLoc.lng,
          notes,
        });
        orderId = res.data.id;
      }
      // Save address to book if user opted in (only for authed customers)
      if (saveLabel && (user?.role === 'customer' || isGuest)) {
        try {
          await api.post('/addresses', {
            label: saveLabel,
            address: pickedLoc.address,
            extra: addressExtra,
            lat: pickedLoc.lat,
            lng: pickedLoc.lng,
          });
        } catch {}
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 220 }} keyboardShouldPersistTaps="handled">
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cart-outline" size={64} color={theme.colors.onSurfaceTertiary} />
              <Text style={styles.emptyTxt}>{t('cartEmpty')}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionHead}>{t('orderSummary')}</Text>
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
                <Ionicons name="cash-outline" size={22} color={theme.colors.brandDark} />
                <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
                  <Text style={styles.codTitle}>{t('payAtDoor')}</Text>
                  <Text style={styles.codDesc}>{t('payAtDoorDesc')}</Text>
                </View>
              </View>

              {isGuest && (
                <>
                  <Text style={styles.sectionHead}>{t('guestCheckoutTitle')}</Text>
                  <Text style={styles.sectionSub}>{t('guestCheckoutSubtitle')}</Text>
                  <View style={styles.inputRow}>
                    <Ionicons name="person-outline" size={18} color={theme.colors.onSurfaceTertiary} />
                    <TextInput testID="guest-name-input" style={styles.rowInput} placeholder={t('name')}
                      placeholderTextColor={theme.colors.onSurfaceTertiary} value={name} onChangeText={setName} />
                  </View>
                  <View style={styles.inputRow}>
                    <Ionicons name="mail-outline" size={18} color={theme.colors.onSurfaceTertiary} />
                    <TextInput testID="guest-email-input" style={styles.rowInput} placeholder={t('email')} autoCapitalize="none"
                      keyboardType="email-address" placeholderTextColor={theme.colors.onSurfaceTertiary} value={email} onChangeText={setEmail} />
                  </View>
                  <View style={styles.inputRow}>
                    <Ionicons name="call-outline" size={18} color={theme.colors.onSurfaceTertiary} />
                    <TextInput testID="guest-phone-input" style={styles.rowInput} placeholder={t('phone')} keyboardType="phone-pad"
                      placeholderTextColor={theme.colors.onSurfaceTertiary} value={phone} onChangeText={setPhone} />
                  </View>
                  <View style={styles.inputRow}>
                    <Ionicons name="lock-closed-outline" size={18} color={theme.colors.onSurfaceTertiary} />
                    <TextInput testID="guest-password-input" style={styles.rowInput} placeholder={t('password')} secureTextEntry
                      placeholderTextColor={theme.colors.onSurfaceTertiary} value={password} onChangeText={setPassword} />
                  </View>
                  <Pressable testID="cart-go-login" onPress={() => router.push('/(auth)/login')} style={styles.loginLink}>
                    <Text style={styles.loginLinkTxt}>{t('alreadyHaveAccount')}</Text>
                  </Pressable>
                </>
              )}

              <Text style={styles.sectionHead}>{t('deliveryAddress')}</Text>
              {savedAddresses.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.savedRow}
                  style={{ marginBottom: theme.spacing.sm }}
                >
                  {savedAddresses.map((a) => (
                    <Pressable
                      key={a.id}
                      testID={`saved-address-${a.id}`}
                      onPress={() => applySaved(a)}
                      style={styles.savedChip}
                    >
                      <Ionicons
                        name={a.label === 'Home' ? 'home' : a.label === 'Work' ? 'briefcase' : 'location'}
                        size={14}
                        color={theme.colors.brandDark}
                      />
                      <Text style={styles.savedChipTxt}>{a.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <LocationPicker
                testID="location-picker"
                value={pickedLoc}
                onChange={setPickedLoc}
              />
              <TextInput
                testID="address-extra-input"
                style={[styles.textArea, { marginTop: theme.spacing.md }]}
                placeholder={t('addressExtraPlaceholder')}
                placeholderTextColor={theme.colors.onSurfaceTertiary}
                value={addressExtra}
                onChangeText={setAddressExtra}
                multiline
              />

              {pickedLoc && (
                <View style={styles.saveRow}>
                  <Text style={styles.saveLbl}>{t('saveAddress')}?</Text>
                  <View style={styles.labelPicker}>
                    {(['Home', 'Work', 'Other'] as const).map((l) => (
                      <Pressable
                        key={l}
                        testID={`save-label-${l}`}
                        onPress={() => setSaveLabel(saveLabel === l ? null : l)}
                        style={[styles.labelChip, saveLabel === l && styles.labelChipActive]}
                      >
                        <Text style={[styles.labelChipTxt, saveLabel === l && styles.labelChipTxtActive]}>
                          {l === 'Home' ? t('labelHome') : l === 'Work' ? t('labelWork') : t('labelOther')}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              <Text style={styles.sectionHead}>{t('notes')}</Text>
              <TextInput
                testID="cart-notes-input"
                style={styles.textArea}
                placeholder={t('notesPlaceholder')}
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
            {!meetsMinOrder && (
              <View style={styles.minOrderWarn}>
                <Ionicons name="alert-circle" size={18} color={theme.colors.error} />
                <Text style={styles.minOrderWarnTxt}>
                  {t('minOrderNotMet').replace('{amount}', `₺${(minOrderValue - total).toFixed(2)}`)}
                </Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('total')}</Text>
              <Text style={styles.totalVal}>₺{total.toFixed(2)}</Text>
            </View>
            <Pressable
              testID="place-order-btn"
              onPress={onPlace}
              disabled={placing || !canPlace}
              style={[styles.orderBtn, (placing || !canPlace) && { opacity: 0.5 }]}
            >
              {placing ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.orderTxt}>{isGuest ? t('createAccountAndOrder') : t('placeOrder')}</Text>
              )}
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
  sectionHead: { fontSize: theme.font.sm, color: theme.colors.onSurfaceTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm, fontWeight: '700' },
  sectionSub: { color: theme.colors.onSurfaceSecondary, marginBottom: theme.spacing.sm, fontSize: theme.font.sm },
  restName: { fontSize: theme.font.lg, fontWeight: '700', color: theme.colors.onSurface, marginBottom: theme.spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
  itemName: { fontSize: theme.font.base, fontWeight: '600', color: theme.colors.onSurface },
  itemPrice: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  qty: { fontWeight: '700', fontSize: theme.font.base, minWidth: 20, textAlign: 'center' },
  codBox: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.lg, backgroundColor: theme.colors.brandTertiary, borderRadius: theme.radius.md, marginTop: theme.spacing.lg },
  codTitle: { fontWeight: '800', color: theme.colors.onSurface, fontSize: theme.font.base },
  codDesc: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm, marginTop: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, height: 48, marginBottom: theme.spacing.sm },
  rowInput: { flex: 1, fontSize: theme.font.base, color: theme.colors.onSurface },
  loginLink: { paddingVertical: theme.spacing.sm, alignItems: 'center' },
  loginLinkTxt: { color: theme.colors.brand, fontWeight: '700' },
  textArea: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, padding: theme.spacing.md, fontSize: theme.font.base, color: theme.colors.onSurface, minHeight: 60 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.divider, padding: theme.spacing.lg },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.md },
  totalLabel: { fontSize: theme.font.lg, color: theme.colors.onSurfaceSecondary },
  totalVal: { fontSize: theme.font.xl, fontWeight: '800', color: theme.colors.onSurface },
  orderBtn: { backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill, height: 54, alignItems: 'center', justifyContent: 'center' },
  orderTxt: { color: '#fff', fontSize: theme.font.lg, fontWeight: '700' },
  err: { color: theme.colors.error, marginTop: theme.spacing.md, textAlign: 'center' },
  savedRow: { gap: theme.spacing.sm, paddingVertical: 2 },
  savedChip: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandTertiary },
  savedChipTxt: { color: theme.colors.brandDark, fontWeight: '700', fontSize: theme.font.sm },
  saveRow: { marginTop: theme.spacing.md, padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md },
  saveLbl: { color: theme.colors.onSurfaceSecondary, marginBottom: theme.spacing.sm, fontSize: theme.font.sm, fontWeight: '600' },
  labelPicker: { flexDirection: 'row', gap: theme.spacing.sm },
  labelChip: { flex: 1, paddingVertical: 8, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', backgroundColor: theme.colors.surface },
  labelChipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  labelChipTxt: { color: theme.colors.onSurface, fontWeight: '600' },
  labelChipTxtActive: { color: '#fff' },
  minOrderWarn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFEAEA', padding: theme.spacing.sm, borderRadius: theme.radius.md, marginBottom: theme.spacing.sm },
  minOrderWarnTxt: { flex: 1, color: theme.colors.error, fontWeight: '700', fontSize: theme.font.sm },
});
