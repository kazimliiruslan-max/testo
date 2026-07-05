import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, Role } from '@/src/context/AuthContext';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ role?: string }>();
  const initialRole: Role = params.role === 'restaurant_owner' ? 'restaurant_owner' : 'customer';
  const [role, setRole] = useState<Role>(initialRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    if (role === 'courier') {
      setErr(t('courierRegisterHint'));
      return;
    }
    if (!name || !email || !password) return;
    setLoading(true);
    setErr(null);
    try {
      const u = await register({
        email: email.trim(), password, name: name.trim(), role,
        phone: phone || undefined, restaurant_name: restaurantName || undefined,
      });
      if (u.role === 'customer') router.replace('/(customer)/home');
      else router.replace('/(owner)/orders');
    } catch (e: any) {
      setErr(e?.response?.data?.detail || t('error'));
    } finally {
      setLoading(false);
    }
  };

  const roleOpts: { key: Role; label: string; icon: any }[] = [
    { key: 'customer', label: t('role_customer'), icon: 'person-outline' },
    { key: 'restaurant_owner', label: t('role_owner'), icon: 'storefront-outline' },
    { key: 'courier', label: t('role_courier'), icon: 'bicycle-outline' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable testID="back-to-login" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.onSurface} />
          </Pressable>

          <Text style={styles.title}>{t('signUp')}</Text>

          <Text style={styles.label}>{t('selectRole')}</Text>
          <View style={styles.rolesRow}>
            {roleOpts.map((r) => (
              <Pressable
                key={r.key}
                testID={`role-${r.key}`}
                onPress={() => setRole(r.key)}
                style={[styles.roleCard, role === r.key && styles.roleCardActive]}
              >
                <Ionicons
                  name={r.icon}
                  size={24}
                  color={role === r.key ? theme.colors.brand : theme.colors.onSurfaceSecondary}
                />
                <Text style={[styles.roleTxt, role === r.key && styles.roleTxtActive]}>{r.label}</Text>
              </Pressable>
            ))}
          </View>

          {role === 'courier' && (
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color={theme.colors.warning} />
              <Text style={styles.infoTxt}>{t('courierRegisterHint')}</Text>
            </View>
          )}

          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={20} color={theme.colors.onSurfaceTertiary} />
              <TextInput testID="reg-name-input" style={styles.input} placeholder={t('name')}
                placeholderTextColor={theme.colors.onSurfaceTertiary} value={name} onChangeText={setName} />
            </View>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={20} color={theme.colors.onSurfaceTertiary} />
              <TextInput testID="reg-email-input" style={styles.input} placeholder={t('email')}
                placeholderTextColor={theme.colors.onSurfaceTertiary} autoCapitalize="none"
                keyboardType="email-address" value={email} onChangeText={setEmail} />
            </View>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={theme.colors.onSurfaceTertiary} />
              <TextInput testID="reg-password-input" style={styles.input} placeholder={t('password')}
                placeholderTextColor={theme.colors.onSurfaceTertiary} secureTextEntry
                value={password} onChangeText={setPassword} />
            </View>
            <View style={styles.inputWrap}>
              <Ionicons name="call-outline" size={20} color={theme.colors.onSurfaceTertiary} />
              <TextInput testID="reg-phone-input" style={styles.input} placeholder={t('phone')}
                placeholderTextColor={theme.colors.onSurfaceTertiary} keyboardType="phone-pad"
                value={phone} onChangeText={setPhone} />
            </View>
            {role === 'restaurant_owner' && (
              <View style={styles.inputWrap}>
                <Ionicons name="storefront-outline" size={20} color={theme.colors.onSurfaceTertiary} />
                <TextInput testID="reg-restaurant-input" style={styles.input} placeholder={t('restaurant_name')}
                  placeholderTextColor={theme.colors.onSurfaceTertiary}
                  value={restaurantName} onChangeText={setRestaurantName} />
              </View>
            )}
            {err && <Text testID="register-error" style={styles.err}>{err}</Text>}
            <Pressable
              testID="register-submit-button"
              onPress={onSubmit}
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }, role === 'courier' && { opacity: 0.5 }]}
              disabled={loading || role === 'courier'}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnTxt}>{t('signUp')}</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  scroll: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
  backBtn: { paddingVertical: theme.spacing.sm, alignSelf: 'flex-start' },
  title: { fontSize: theme.font.xxl, fontWeight: '800', color: theme.colors.onSurface, marginBottom: theme.spacing.lg },
  label: { fontSize: theme.font.base, color: theme.colors.onSurfaceSecondary, marginBottom: theme.spacing.sm },
  rolesRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  roleCard: {
    flex: 1, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md, borderWidth: 1.5, borderColor: theme.colors.border,
    alignItems: 'center', gap: theme.spacing.xs,
  },
  roleCardActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandTertiary },
  roleTxt: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, fontWeight: '600' },
  roleTxtActive: { color: theme.colors.brand },
  infoBox: {
    flexDirection: 'row', gap: theme.spacing.sm, backgroundColor: '#FFF6E6',
    padding: theme.spacing.md, borderRadius: theme.radius.md, marginBottom: theme.spacing.lg,
  },
  infoTxt: { flex: 1, color: theme.colors.onSurface, fontSize: theme.font.base },
  form: { gap: theme.spacing.md },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg, height: 52,
  },
  input: { flex: 1, fontSize: theme.font.lg, color: theme.colors.onSurface },
  primaryBtn: {
    backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill, height: 54,
    alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.md,
  },
  primaryBtnTxt: { color: theme.colors.onBrand, fontSize: theme.font.lg, fontWeight: '700' },
  err: { color: theme.colors.error, fontSize: theme.font.base, textAlign: 'center' },
});
