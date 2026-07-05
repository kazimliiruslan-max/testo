import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

export default function CustomerProfile() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();

  const onLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg }}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={36} color={theme.colors.onBrand} />
          </View>
          <View style={{ flex: 1, marginLeft: theme.spacing.lg }}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>{t('language')}</Text>
        <View style={styles.langRow}>
          <Pressable
            testID="profile-lang-en"
            onPress={() => setLang('en')}
            style={[styles.langBtn, lang === 'en' && styles.langBtnActive]}
          >
            <Text style={[styles.langTxt, lang === 'en' && styles.langTxtActive]}>English</Text>
          </Pressable>
          <Pressable
            testID="profile-lang-tr"
            onPress={() => setLang('tr')}
            style={[styles.langBtn, lang === 'tr' && styles.langBtnActive]}
          >
            <Text style={[styles.langTxt, lang === 'tr' && styles.langTxtActive]}>Türkçe</Text>
          </Pressable>
        </View>

        <Pressable testID="logout-button" onPress={onLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
          <Text style={styles.logoutTxt}>{t('logout')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.xl },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: theme.font.xl, fontWeight: '700', color: theme.colors.onSurface },
  email: { fontSize: theme.font.base, color: theme.colors.onSurfaceSecondary },
  sectionLabel: { fontSize: theme.font.sm, color: theme.colors.onSurfaceTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: theme.spacing.sm, fontWeight: '700' },
  langRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.xl },
  langBtn: { flex: 1, paddingVertical: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' },
  langBtnActive: { backgroundColor: theme.colors.inverse, borderColor: theme.colors.inverse },
  langTxt: { color: theme.colors.onSurface, fontWeight: '700' },
  langTxtActive: { color: theme.colors.onInverse },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.lg, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md },
  logoutTxt: { color: theme.colors.error, fontWeight: '700', fontSize: theme.font.lg },
});
