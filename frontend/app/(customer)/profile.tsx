import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

export default function CustomerProfile() {
  const { user, logout, refresh } = useAuth();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [showRestaurantSetup, setShowRestaurantSetup] = useState(false);
  const [restName, setRestName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      setErr(e?.response?.data?.detail || t('error'));
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
});
