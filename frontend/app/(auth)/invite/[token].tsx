import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, saveToken, formatApiError } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

export default function InviteAccept() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { refresh } = useAuth();
  const { t } = useI18n();
  const [info, setInfo] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/couriers/invite/${token}`);
        setInfo(res.data);
      } catch (e: any) {
        setErr(formatApiError(e, t('inviteInvalid')));
      } finally {
        setLoading(false);
      }
    })();
  }, [token, t]);

  const onActivate = async () => {
    if (!password) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await api.post('/couriers/accept-invite', { token, password });
      await saveToken(res.data.access_token);
      await refresh();
      router.replace('/(courier)/deliveries');
    } catch (e: any) {
      setErr(formatApiError(e, t('error')));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.brand} /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.xl }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.replace('/(customer)/home')} style={styles.back}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.onSurface} />
          </Pressable>

          <View style={styles.iconWrap}>
            <View style={styles.icon}><Ionicons name="bicycle" size={40} color="#fff" /></View>
          </View>

          <Text style={styles.title}>{t('acceptInviteTitle')}</Text>
          <Text style={{ textAlign: 'center', color: theme.colors.onSurfaceSecondary, marginBottom: theme.spacing.lg, fontSize: theme.font.base }}>
            {t('acceptInviteSubtitle')}
          </Text>

          {!info ? (
            <Text style={styles.err}>{err || t('inviteInvalid')}</Text>
          ) : (
            <>
              <View style={styles.infoCard}>
                <Text style={styles.infoLbl}>{t('name')}</Text>
                <Text style={styles.infoVal}>{info.name}</Text>
                <Text style={styles.infoLbl}>{t('email')}</Text>
                <Text style={styles.infoVal}>{info.email}</Text>
                <Text style={styles.infoLbl}>Restaurant</Text>
                <Text style={styles.infoVal}>{info.restaurant_name}</Text>
              </View>

              <Text style={styles.label}>{t('setPassword')}</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={20} color={theme.colors.onSurfaceTertiary} />
                <TextInput
                  testID="invite-password-input"
                  style={styles.input}
                  placeholder={t('password')}
                  placeholderTextColor={theme.colors.onSurfaceTertiary}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </View>
              {err && <Text style={styles.err}>{err}</Text>}
              <Pressable
                testID="invite-activate-btn"
                onPress={onActivate}
                disabled={saving || !password}
                style={[styles.btn, (!password || saving) && { opacity: 0.5 }]}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>{t('activate')}</Text>}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { paddingVertical: theme.spacing.sm },
  iconWrap: { alignItems: 'center', marginBottom: theme.spacing.lg },
  icon: { width: 88, height: 88, borderRadius: 44, backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: theme.font.xxl, fontWeight: '800', textAlign: 'center', color: theme.colors.onSurface, marginBottom: theme.spacing.xl },
  infoCard: { backgroundColor: theme.colors.brandTertiary, padding: theme.spacing.lg, borderRadius: theme.radius.md, marginBottom: theme.spacing.xl },
  infoLbl: { color: theme.colors.onSurfaceTertiary, fontSize: theme.font.sm, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700', marginTop: theme.spacing.sm },
  infoVal: { color: theme.colors.onSurface, fontSize: theme.font.lg, fontWeight: '700' },
  label: { fontSize: theme.font.sm, color: theme.colors.onSurfaceTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: theme.spacing.sm, fontWeight: '700' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.lg, height: 52, marginBottom: theme.spacing.lg },
  input: { flex: 1, fontSize: theme.font.lg, color: theme.colors.onSurface },
  btn: { backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill, height: 54, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: '#fff', fontSize: theme.font.lg, fontWeight: '700' },
  err: { color: theme.colors.error, textAlign: 'center', marginTop: theme.spacing.sm },
});
