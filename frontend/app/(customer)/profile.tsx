import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { api, formatApiError } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

interface SavedAddress {
  id: string; label: string; address: string; extra: string; lat: number; lng: number;
}

export default function CustomerProfile() {
  const { user, logout, refresh } = useAuth();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [showRestaurantSetup, setShowRestaurantSetup] = useState(false);
  const [restName, setRestName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  // Restaurant settings modal (owner)
  const [showRestSettings, setShowRestSettings] = useState(false);
  const [restInfo, setRestInfo] = useState<any>(null);
  const [radiusInput, setRadiusInput] = useState('');
  const [minOrderInput, setMinOrderInput] = useState('');
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [pickingLogo, setPickingLogo] = useState(false);
  const [savingRest, setSavingRest] = useState(false);

  const pickLogo = async () => {
    setPickingLogo(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6, base64: true, allowsEditing: true, aspect: [1, 1],
      });
      if (res.canceled || !res.assets?.[0]?.base64) return;
      setLogoBase64(res.assets[0].base64!);
    } finally { setPickingLogo(false); }
  };

  const openRestSettings = async () => {
    setShowRestSettings(true);
    setRestInfo(null);
    setLogoBase64(null);
    try {
      const r = await api.get('/restaurants/me/info');
      setRestInfo(r.data);
      setRadiusInput(String(r.data.delivery_radius_km ?? 5));
      setMinOrderInput(String(r.data.min_order_value ?? 0));
    } catch {}
  };

  const saveRestSettings = async () => {
    const val = parseFloat(radiusInput);
    const minVal = parseFloat(minOrderInput || '0');
    if (isNaN(val) || val <= 0) return;
    if (isNaN(minVal) || minVal < 0) return;
    setSavingRest(true);
    try {
      const body: any = { delivery_radius_km: val, min_order_value: minVal };
      if (logoBase64) body.logo_base64 = logoBase64;
      await api.put('/restaurants/me', body);
      setShowRestSettings(false);
    } catch {}
    finally { setSavingRest(false); }
  };

  useEffect(() => {
    if (user?.role === 'customer') {
      api.get('/addresses').then((r) => setAddresses(r.data)).catch(() => {});
    } else {
      setAddresses([]);
    }
  }, [user]);

  const deleteAddress = async (id: string) => {
    await api.delete(`/addresses/${id}`);
    setAddresses((a) => a.filter((x) => x.id !== id));
  };

  const onLogout = async () => {
    await logout();
    router.replace('/(customer)/home');
  };

  const activateRestaurantMode = async () => {
    if (!restName.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await api.post('/auth/switch-to-owner', { restaurant_name: restName.trim() });
      await refresh();
      setShowRestaurantSetup(false);
      router.replace('/(owner)/dashboard');
    } catch (e: any) {
      setErr(formatApiError(e, t('error')));
    } finally {
      setSaving(false);
    }
  };

  const goRestaurantOwner = () => {
    if (!user) {
      // Guest → send to register with owner preselected
      router.push('/(auth)/register?role=restaurant_owner');
      return;
    }
    if (user.role === 'restaurant_owner') {
      router.replace('/(owner)/dashboard');
      return;
    }
    setShowRestaurantSetup(true);
  };

  const switchBackToCustomer = () => {
    router.replace('/(customer)/home');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={36} color="#fff" />
          </View>
          <View style={{ flex: 1, marginLeft: theme.spacing.lg }}>
            <Text style={styles.name}>{user?.name || t('guest')}</Text>
            <Text style={styles.email}>{user?.email || t('signInPrompt')}</Text>
          </View>
        </View>

        {!user && (
          <View style={styles.guestCard}>
            <Ionicons name="log-in-outline" size={22} color={theme.colors.brandDark} />
            <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
              <Text style={styles.guestTitle}>Sign in or create an account</Text>
              <Text style={styles.guestDesc}>Track your orders and reorder your favorites.</Text>
            </View>
            <Pressable testID="profile-login-cta" onPress={() => router.push('/(auth)/login')} style={styles.smallBtn}>
              <Text style={styles.smallBtnTxt}>{t('signIn')}</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionLabel}>Business</Text>
        {user?.role === 'restaurant_owner' ? (
          <>
            <Pressable testID="go-restaurant-dashboard" onPress={() => router.replace('/(owner)/dashboard')} style={styles.rowBtn}>
              <Ionicons name="storefront" size={22} color={theme.colors.brand} />
              <Text style={styles.rowBtnTxt}>Restaurant Dashboard</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceTertiary} />
            </Pressable>
            <Pressable testID="open-restaurant-settings" onPress={openRestSettings} style={styles.rowBtn}>
              <Ionicons name="settings-outline" size={22} color={theme.colors.brand} />
              <Text style={styles.rowBtnTxt}>{t('restaurantSettings')}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceTertiary} />
            </Pressable>
            <Pressable testID="switch-to-customer" onPress={switchBackToCustomer} style={styles.rowBtn}>
              <Ionicons name="person" size={22} color={theme.colors.onSurfaceSecondary} />
              <Text style={styles.rowBtnTxt}>{t('switchToCustomer')}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceTertiary} />
            </Pressable>
          </>
        ) : (
          <Pressable testID="become-restaurant" onPress={goRestaurantOwner} style={styles.becomeCard}>
            <View style={styles.becomeIcon}><Ionicons name="storefront" size={22} color={theme.colors.brandDark} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.becomeTitle}>{t('switchToRestaurant')}</Text>
              <Text style={styles.becomeDesc}>{t('switchToRestaurantDesc')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceTertiary} />
          </Pressable>
        )}

        <Text style={styles.sectionLabel}>{t('language')}</Text>
        <View style={styles.langRow}>
          <Pressable testID="profile-lang-en" onPress={() => setLang('en')} style={[styles.langBtn, lang === 'en' && styles.langBtnActive]}>
            <Text style={[styles.langTxt, lang === 'en' && styles.langTxtActive]}>English</Text>
          </Pressable>
          <Pressable testID="profile-lang-tr" onPress={() => setLang('tr')} style={[styles.langBtn, lang === 'tr' && styles.langBtnActive]}>
            <Text style={[styles.langTxt, lang === 'tr' && styles.langTxtActive]}>Türkçe</Text>
          </Pressable>
        </View>

        {user?.role === 'customer' && (
          <>
            <Text style={styles.sectionLabel}>{t('savedAddresses')}</Text>
            {addresses.length === 0 ? (
              <View style={styles.emptyAddr}>
                <Ionicons name="location-outline" size={22} color={theme.colors.onSurfaceTertiary} />
                <Text style={styles.emptyAddrTxt}>{t('noSavedAddresses')}</Text>
              </View>
            ) : (
              addresses.map((a) => (
                <View key={a.id} style={styles.addrRow} testID={`addr-row-${a.id}`}>
                  <View style={styles.addrIcon}>
                    <Ionicons
                      name={a.label === 'Home' ? 'home' : a.label === 'Work' ? 'briefcase' : 'location'}
                      size={18}
                      color={theme.colors.brandDark}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addrLabel}>{a.label}</Text>
                    <Text style={styles.addrLine} numberOfLines={2}>
                      {a.address}{a.extra ? ` — ${a.extra}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    testID={`delete-addr-${a.id}`}
                    onPress={() => deleteAddress(a.id)}
                    style={styles.delBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                  </Pressable>
                </View>
              ))
            )}
          </>
        )}

        {user && (
          <Pressable testID="logout-button" onPress={onLogout} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
            <Text style={styles.logoutTxt}>{t('logout')}</Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal visible={showRestaurantSetup} transparent animationType="slide" onRequestClose={() => setShowRestaurantSetup(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalBg}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>{t('restaurantSetup')}</Text>
              <Text style={styles.modalDesc}>{t('switchToRestaurantDesc')}</Text>
              <TextInput
                testID="restaurant-setup-name"
                style={styles.input}
                placeholder={t('yourRestaurantName')}
                placeholderTextColor={theme.colors.onSurfaceTertiary}
                value={restName}
                onChangeText={setRestName}
              />
              {err && <Text style={styles.errTxt}>{err}</Text>}
              <View style={styles.mActions}>
                <Pressable onPress={() => setShowRestaurantSetup(false)} style={[styles.mBtn, styles.mBtnCancel]}>
                  <Text>{t('cancel')}</Text>
                </Pressable>
                <Pressable testID="activate-restaurant" onPress={activateRestaurantMode} disabled={saving} style={[styles.mBtn, styles.mBtnSave]}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{t('activateRestaurant')}</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={showRestSettings} transparent animationType="slide" onRequestClose={() => setShowRestSettings(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalBg}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>{t('restaurantSettings')}</Text>
              {!restInfo ? (
                <ActivityIndicator color={theme.colors.brand} style={{ marginVertical: theme.spacing.lg }} />
              ) : (
                <>
                  <Text style={{ color: theme.colors.onSurfaceSecondary, marginBottom: theme.spacing.sm }}>
                    {restInfo.name}
                  </Text>
                  <Text style={{ fontSize: theme.font.sm, color: theme.colors.onSurfaceTertiary, fontWeight: '700', marginTop: theme.spacing.md, textTransform: 'uppercase' }}>
                    {t('restaurantLogo')}
                  </Text>
                  <View style={styles.logoRow}>
                    <View style={styles.logoPreview}>
                      {(logoBase64 || restInfo.logo_url) ? (
                        <Image
                          source={{ uri: logoBase64 ? `data:image/jpeg;base64,${logoBase64}` : restInfo.logo_url }}
                          style={{ width: 64, height: 64, borderRadius: 32 }}
                        />
                      ) : (
                        <Ionicons name="storefront" size={28} color={theme.colors.brandDark} />
                      )}
                    </View>
                    <Pressable testID="pick-logo-btn" onPress={pickLogo} disabled={pickingLogo} style={styles.pickLogoBtn}>
                      {pickingLogo
                        ? <ActivityIndicator color={theme.colors.brand} />
                        : <><Ionicons name="cloud-upload-outline" size={18} color={theme.colors.brand} /><Text style={styles.pickLogoTxt}>{t('uploadLogo')}</Text></>}
                    </Pressable>
                  </View>
                  <Text style={{ fontSize: theme.font.sm, color: theme.colors.onSurfaceTertiary, fontWeight: '700', marginTop: theme.spacing.md }}>
                    {t('deliveryRadiusKm').toUpperCase()}
                  </Text>
                  <TextInput
                    testID="restaurant-radius-input"
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={radiusInput}
                    onChangeText={setRadiusInput}
                    placeholder="5"
                    placeholderTextColor={theme.colors.onSurfaceTertiary}
                  />
                  <Text style={{ color: theme.colors.onSurfaceTertiary, fontSize: theme.font.sm, marginTop: theme.spacing.xs }}>
                    {t('radiusHelp')}
                  </Text>
                  <Text style={{ fontSize: theme.font.sm, color: theme.colors.onSurfaceTertiary, fontWeight: '700', marginTop: theme.spacing.md }}>
                    {t('minOrderValue').toUpperCase()}
                  </Text>
                  <TextInput
                    testID="restaurant-min-order-input"
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={minOrderInput}
                    onChangeText={setMinOrderInput}
                    placeholder="0"
                    placeholderTextColor={theme.colors.onSurfaceTertiary}
                  />
                  <Text style={{ color: theme.colors.onSurfaceTertiary, fontSize: theme.font.sm, marginTop: theme.spacing.xs }}>
                    {t('minOrderHelp')}
                  </Text>
                  <View style={styles.mActions}>
                    <Pressable onPress={() => setShowRestSettings(false)} style={[styles.mBtn, styles.mBtnCancel]}>
                      <Text>{t('cancel')}</Text>
                    </Pressable>
                    <Pressable
                      testID="save-restaurant-settings"
                      onPress={saveRestSettings}
                      disabled={savingRest}
                      style={[styles.mBtn, styles.mBtnSave]}
                    >
                      {savingRest ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{t('save')}</Text>}
                    </Pressable>
                  </View>
                  {!restInfo.campaign_active ? (
                    <>
                      <Text style={styles.campaignHint}>⚡ {t('campaignPickDuration')}</Text>
                      <View style={styles.campaignDurationRow}>
                        {[1, 3, 7, 14, 30].map((d) => (
                          <Pressable
                            key={d}
                            testID={`campaign-duration-${d}`}
                            onPress={async () => {
                              try {
                                const res = await api.post('/restaurants/me/campaign/start', { days: d });
                                setRestInfo(res.data);
                              } catch {}
                            }}
                            style={styles.campaignDurationChip}
                          >
                            <Text style={styles.campaignDurationTxt}>{d}d</Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  ) : (
                    <Pressable
                      testID="toggle-campaign-btn"
                      onPress={async () => {
                        try {
                          const res = await api.post('/restaurants/me/campaign/stop');
                          setRestInfo(res.data);
                        } catch {}
                      }}
                      style={[styles.campaignBtn, styles.campaignStop]}
                    >
                      <Ionicons name="stop-circle" size={18} color="#fff" />
                      <Text style={styles.campaignBtnTxt}>{t('stopCampaign')}</Text>
                    </Pressable>
                  )}
                  {restInfo.campaign_active && restInfo.campaign_ends_at && (
                    <Text style={{ textAlign: 'center', color: theme.colors.brandDark, marginTop: 6, fontWeight: '600' }}>
                      {t('campaignEnds')} {new Date(restInfo.campaign_ends_at).toLocaleString()}
                    </Text>
                  )}
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.xl },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: theme.font.xl, fontWeight: '700', color: theme.colors.onSurface },
  email: { fontSize: theme.font.base, color: theme.colors.onSurfaceSecondary },
  guestCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.brandTertiary, borderRadius: theme.radius.md, padding: theme.spacing.md, marginBottom: theme.spacing.xl },
  guestTitle: { fontWeight: '800', color: theme.colors.onSurface },
  guestDesc: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm, marginTop: 2 },
  smallBtn: { backgroundColor: theme.colors.brand, paddingHorizontal: theme.spacing.md, paddingVertical: 8, borderRadius: theme.radius.pill },
  smallBtnTxt: { color: '#fff', fontWeight: '700' },
  sectionLabel: { fontSize: theme.font.sm, color: theme.colors.onSurfaceTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: theme.spacing.sm, fontWeight: '700', marginTop: theme.spacing.md },
  langRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.xl },
  langBtn: { flex: 1, paddingVertical: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' },
  langBtnActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  langTxt: { color: theme.colors.onSurface, fontWeight: '700' },
  langTxtActive: { color: '#fff' },
  rowBtn: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, marginBottom: theme.spacing.sm },
  rowBtnTxt: { flex: 1, fontSize: theme.font.lg, color: theme.colors.onSurface, fontWeight: '600' },
  becomeCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.md, backgroundColor: theme.colors.brandTertiary, borderRadius: theme.radius.md, marginBottom: theme.spacing.sm },
  becomeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  becomeTitle: { fontWeight: '800', color: theme.colors.onSurface, fontSize: theme.font.lg },
  becomeDesc: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm, marginTop: 2 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.lg, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md },
  logoutTxt: { color: theme.colors.error, fontWeight: '700', fontSize: theme.font.lg },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', padding: theme.spacing.xl, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalTitle: { fontSize: theme.font.xl, fontWeight: '800', color: theme.colors.onSurface },
  modalDesc: { color: theme.colors.onSurfaceSecondary, marginVertical: theme.spacing.sm },
  input: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, padding: theme.spacing.md, marginTop: theme.spacing.md, fontSize: theme.font.base, color: theme.colors.onSurface },
  mActions: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.lg },
  mBtn: { flex: 1, padding: theme.spacing.md, borderRadius: theme.radius.pill, alignItems: 'center' },
  mBtnCancel: { backgroundColor: theme.colors.surfaceSecondary },
  mBtnSave: { backgroundColor: theme.colors.brand },
  errTxt: { color: theme.colors.error, marginTop: theme.spacing.sm, textAlign: 'center' },
  emptyAddr: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, marginBottom: theme.spacing.sm },
  emptyAddrTxt: { color: theme.colors.onSurfaceTertiary },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, marginBottom: theme.spacing.sm },
  addrIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  addrLabel: { fontWeight: '800', color: theme.colors.onSurface, fontSize: theme.font.base },
  addrLine: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm, marginTop: 2 },
  delBtn: { padding: 6 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginTop: theme.spacing.sm },
  logoPreview: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.brandTertiary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pickLogoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.brand, borderStyle: 'dashed' },
  pickLogoTxt: { color: theme.colors.brand, fontWeight: '700' },
  campaignBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: theme.spacing.md, borderRadius: theme.radius.pill, marginTop: theme.spacing.lg },
  campaignStart: { backgroundColor: theme.colors.brand },
  campaignStop: { backgroundColor: theme.colors.error },
  campaignBtnTxt: { color: '#fff', fontWeight: '800', fontSize: theme.font.base },
  campaignHint: { textAlign: 'center', color: theme.colors.onSurfaceSecondary, marginTop: theme.spacing.md, fontSize: theme.font.sm, fontWeight: '600' },
  campaignDurationRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm, justifyContent: 'center', flexWrap: 'wrap' },
  campaignDurationChip: { minWidth: 48, paddingHorizontal: theme.spacing.md, paddingVertical: 8, backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill, alignItems: 'center' },
  campaignDurationTxt: { color: '#fff', fontWeight: '800', fontSize: theme.font.base },
});
