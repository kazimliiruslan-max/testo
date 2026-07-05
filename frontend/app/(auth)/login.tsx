import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/context/AuthContext';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email || !password) return;
    setLoading(true);
    setErr(null);
    try {
      const u = await login(email.trim(), password);
      if (u.role === 'customer') router.replace('/(customer)/home');
      else if (u.role === 'restaurant_owner') router.replace('/(owner)/dashboard');
      else router.replace('/(courier)/deliveries');
    } catch (e: any) {
      setErr(e?.response?.data?.detail || t('invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.langRow}>
            <Pressable
              testID="lang-toggle-en"
              onPress={() => setLang('en')}
              style={[styles.langBtn, lang === 'en' && styles.langBtnActive]}
            >
              <Text style={[styles.langTxt, lang === 'en' && styles.langTxtActive]}>EN</Text>
            </Pressable>
            <Pressable
              testID="lang-toggle-tr"
              onPress={() => setLang('tr')}
              style={[styles.langBtn, lang === 'tr' && styles.langBtnActive]}
            >
              <Text style={[styles.langTxt, lang === 'tr' && styles.langTxtActive]}>TR</Text>
            </Pressable>
          </View>

          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <Ionicons name="restaurant" size={40} color={theme.colors.onBrand} />
            </View>
            <Text style={styles.title}>{t('welcome')}</Text>
            <Text style={styles.subtitle}>{t('subtitle')}</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={20} color={theme.colors.onSurfaceTertiary} />
              <TextInput
                testID="login-email-input"
                style={styles.input}
                placeholder={t('email')}
                placeholderTextColor={theme.colors.onSurfaceTertiary}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={theme.colors.onSurfaceTertiary} />
              <TextInput
                testID="login-password-input"
                style={styles.input}
                placeholder={t('password')}
                placeholderTextColor={theme.colors.onSurfaceTertiary}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>
            {err && <Text testID="login-error" style={styles.err}>{err}</Text>}
            <Pressable
              testID="login-submit-button"
              onPress={onSubmit}
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnTxt}>{t('signIn')}</Text>}
            </Pressable>

            <Pressable
              testID="go-to-register-button"
              onPress={() => router.push('/(auth)/register')}
              style={styles.secondaryLink}
            >
              <Text style={styles.secondaryLinkTxt}>
                {t('noAccount')} <Text style={{ color: theme.colors.brand, fontWeight: '700' }}>{t('signUp')}</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  scroll: { flexGrow: 1, paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xl },
  langRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  langBtn: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border },
  langBtnActive: { backgroundColor: theme.colors.inverse, borderColor: theme.colors.inverse },
  langTxt: { color: theme.colors.onSurface, fontSize: theme.font.sm, fontWeight: '700' },
  langTxtActive: { color: theme.colors.onInverse },
  logoWrap: { alignItems: 'center', marginTop: theme.spacing.xxl, marginBottom: theme.spacing.xxl },
  logoCircle: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: theme.colors.brand,
    alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.lg,
  },
  title: { fontSize: theme.font.xxl, fontWeight: '800', color: theme.colors.onSurface, textAlign: 'center' },
  subtitle: { fontSize: theme.font.base, color: theme.colors.onSurfaceSecondary, marginTop: theme.spacing.xs, textAlign: 'center' },
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
  secondaryLink: { alignItems: 'center', marginTop: theme.spacing.md },
  secondaryLinkTxt: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.base },
  err: { color: theme.colors.error, fontSize: theme.font.base, textAlign: 'center' },
});
