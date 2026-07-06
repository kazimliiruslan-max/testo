import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api/client';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

export default function OwnerCouriers() {
  const { t } = useI18n();
  const [couriers, setCouriers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/couriers');
      setCouriers(res.data);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    if (!form.email || !form.name) return;
    setSaving(true); setErr(null);
    try {
      const res = await api.post('/couriers/invite', form);
      setInviteResult(res.data);
      setShow(false);
      setForm({ email: '', name: '', phone: '' });
    } catch (e: any) { setErr(e?.response?.data?.detail || 'Error'); }
    finally { setSaving(false); }
  };

  const copyLink = async () => {
    if (!inviteResult?.invite_link) return;
    await Clipboard.setStringAsync(inviteResult.invite_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('tab_owner_couriers')}</Text>
        <Pressable testID="invite-courier-btn" onPress={() => setShow(true)} style={styles.headerAdd}>
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>
      {loading ? <ActivityIndicator color={theme.colors.brand} style={{ marginTop: 40 }} /> : (
        <FlatList
          testID="couriers-list"
          data={couriers}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg }}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.avatar}><Ionicons name="bicycle" size={22} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>{item.phone || '—'}</Text>
                {item.lat && <Text style={styles.loc}>📍 {item.lat.toFixed(4)}, {item.lng.toFixed(4)}</Text>}
              </View>
              {item.lat != null && <View style={styles.liveDot} />}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="bicycle-outline" size={48} color={theme.colors.onSurfaceTertiary} />
              <Text style={styles.emptyTxt}>No couriers yet. Tap + to invite one.</Text>
            </View>
          }
        />
      )}

      {/* Invite form */}
      <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalBg}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>{t('inviteCourier')}</Text>
              <TextInput testID="courier-name-input" style={styles.input} placeholder={t('name')} placeholderTextColor={theme.colors.onSurfaceTertiary} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
              <TextInput testID="courier-email-input" style={styles.input} placeholder={t('email')} placeholderTextColor={theme.colors.onSurfaceTertiary} autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} />
              <TextInput testID="courier-phone-input" style={styles.input} placeholder={t('phone')} placeholderTextColor={theme.colors.onSurfaceTertiary} keyboardType="phone-pad" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} />
              {err && <Text style={styles.err}>{err}</Text>}
              <View style={styles.actions}>
                <Pressable onPress={() => setShow(false)} style={[styles.btn, styles.btnCancel]}><Text>{t('cancel')}</Text></Pressable>
                <Pressable testID="courier-invite-send" onPress={submit} disabled={saving} style={[styles.btn, styles.btnSave]}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{t('inviteCourier')}</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Invite result: shareable link */}
      <Modal visible={!!inviteResult} transparent animationType="slide" onRequestClose={() => { setInviteResult(null); load(); }}>
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <View style={styles.successIcon}><Ionicons name="checkmark" size={32} color="#fff" /></View>
            <Text style={styles.modalTitle}>{t('inviteSent')}</Text>
            {inviteResult?.email_sent ? (
              <View style={styles.emailBadge}>
                <Ionicons name="mail" size={16} color={theme.colors.brandDark} />
                <Text style={styles.emailBadgeTxt}>{t('emailSent')} · {inviteResult?.email}</Text>
              </View>
            ) : (
              <View style={[styles.emailBadge, { backgroundColor: '#FFF6E6' }]}>
                <Ionicons name="alert-circle-outline" size={16} color={theme.colors.warning} />
                <Text style={[styles.emailBadgeTxt, { color: theme.colors.warning }]}>{t('emailNotSent')}</Text>
              </View>
            )}
            <Text style={styles.inviteNote}>{t('inviteLinkNote')}</Text>
            <View style={styles.linkBox}>
              <Text testID="invite-link-value" style={styles.linkTxt} numberOfLines={2}>{inviteResult?.invite_link}</Text>
            </View>
            <Pressable testID="copy-invite-link" onPress={copyLink} style={styles.copyBtn}>
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color="#fff" />
              <Text style={styles.copyBtnTxt}>{copied ? t('linkCopied') : t('copyLink')}</Text>
            </Pressable>
            <Pressable testID="invite-close" onPress={() => { setInviteResult(null); load(); }} style={[styles.btn, styles.btnCancel, { marginTop: theme.spacing.sm }]}>
              <Text style={{ fontWeight: '700' }}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
  headerTitle: { fontSize: theme.font.xxl, fontWeight: '800', color: theme.colors.onSurface },
  headerAdd: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center', padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: theme.font.lg, fontWeight: '700', color: theme.colors.onSurface },
  sub: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm },
  loc: { color: theme.colors.onSurfaceTertiary, fontSize: theme.font.sm, marginTop: 2 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.brand },
  empty: { alignItems: 'center', marginTop: 60, gap: theme.spacing.md },
  emptyTxt: { color: theme.colors.onSurfaceTertiary },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', padding: theme.spacing.xl, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalTitle: { fontSize: theme.font.xl, fontWeight: '800', marginBottom: theme.spacing.md, color: theme.colors.onSurface },
  input: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, padding: theme.spacing.md, marginBottom: theme.spacing.sm, fontSize: theme.font.base, color: theme.colors.onSurface },
  actions: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.lg },
  btn: { flex: 1, padding: theme.spacing.md, borderRadius: theme.radius.pill, alignItems: 'center' },
  btnCancel: { backgroundColor: theme.colors.surfaceSecondary },
  btnSave: { backgroundColor: theme.colors.brand },
  err: { color: theme.colors.error, textAlign: 'center', marginTop: theme.spacing.sm },
  successIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: theme.spacing.md },
  inviteNote: { color: theme.colors.onSurfaceSecondary, marginBottom: theme.spacing.md, fontSize: theme.font.base },
  linkBox: { backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.md, borderRadius: theme.radius.md, marginBottom: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border },
  linkTxt: { color: theme.colors.brandDark, fontSize: theme.font.sm, fontWeight: '600' },
  copyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, backgroundColor: theme.colors.brand, padding: theme.spacing.md, borderRadius: theme.radius.pill },
  copyBtnTxt: { color: '#fff', fontWeight: '700', fontSize: theme.font.base },
  emailBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.brandTertiary, paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, alignSelf: 'flex-start', marginBottom: theme.spacing.sm },
  emailBadgeTxt: { color: theme.colors.brandDark, fontWeight: '700', fontSize: theme.font.sm },
});
