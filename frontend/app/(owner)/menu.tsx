import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

export default function OwnerMenu() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', price: '', category: 'Main', image_url: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user?.restaurant_id) return;
    try {
      const res = await api.get(`/restaurants/${user.restaurant_id}/menu`);
      setItems(res.data);
    } finally {
      setLoading(false);
    }
  }, [user?.restaurant_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    if (!form.name || !form.price) return;
    setSaving(true);
    try {
      await api.post('/menu', {
        name: form.name, description: form.description, price: parseFloat(form.price),
        category: form.category, image_url: form.image_url,
      });
      setShowAdd(false);
      setForm({ name: '', description: '', price: '', category: 'Main', image_url: '' });
      load();
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    await api.delete(`/menu/${id}`);
    load();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('tab_owner_menu')}</Text>
        <Pressable testID="add-menu-btn" onPress={() => setShowAdd(true)} style={styles.headerAdd}>
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.brand} /> : (
        <FlatList
          testID="menu-list"
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.desc}>{item.description}</Text>
                <Text style={styles.price}>₺{item.price.toFixed(2)} · {item.category}</Text>
              </View>
              <Pressable testID={`delete-item-${item.id}`} onPress={() => del(item.id)} style={styles.delBtn}>
                <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
              </Pressable>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No menu items. Tap + to add one.</Text>}
        />
      )}

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalBg}>
            <View style={styles.modal}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>{t('addMenuItem')}</Text>
                <TextInput testID="menu-name-input" style={styles.input} placeholder={t('itemName')} placeholderTextColor={theme.colors.onSurfaceTertiary} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
                <TextInput testID="menu-desc-input" style={styles.input} placeholder={t('description')} placeholderTextColor={theme.colors.onSurfaceTertiary} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} />
                <TextInput testID="menu-price-input" style={styles.input} placeholder={t('price')} placeholderTextColor={theme.colors.onSurfaceTertiary} keyboardType="decimal-pad" value={form.price} onChangeText={(v) => setForm({ ...form, price: v })} />
                <TextInput testID="menu-category-input" style={styles.input} placeholder={t('category')} placeholderTextColor={theme.colors.onSurfaceTertiary} value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} />
                <TextInput testID="menu-image-input" style={styles.input} placeholder={t('imageUrl')} placeholderTextColor={theme.colors.onSurfaceTertiary} value={form.image_url} onChangeText={(v) => setForm({ ...form, image_url: v })} />
                <View style={styles.modalActions}>
                  <Pressable onPress={() => setShowAdd(false)} style={[styles.mBtn, styles.mBtnCancel]}><Text>{t('cancel')}</Text></Pressable>
                  <Pressable testID="menu-save-btn" onPress={submit} disabled={saving} style={[styles.mBtn, styles.mBtnSave]}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{t('save')}</Text>}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
  headerTitle: { fontSize: theme.font.xxl, fontWeight: '800', color: theme.colors.onSurface },
  headerAdd: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md },
  name: { fontSize: theme.font.lg, fontWeight: '700', color: theme.colors.onSurface },
  desc: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm },
  price: { color: theme.colors.brand, fontWeight: '700', marginTop: 4 },
  delBtn: { padding: theme.spacing.sm },
  empty: { color: theme.colors.onSurfaceTertiary, textAlign: 'center', marginTop: 60 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', padding: theme.spacing.xl, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalTitle: { fontSize: theme.font.xl, fontWeight: '800', marginBottom: theme.spacing.md, color: theme.colors.onSurface },
  input: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, padding: theme.spacing.md, marginBottom: theme.spacing.sm, fontSize: theme.font.base, color: theme.colors.onSurface },
  modalActions: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.lg },
  mBtn: { flex: 1, padding: theme.spacing.md, borderRadius: theme.radius.pill, alignItems: 'center' },
  mBtnCancel: { backgroundColor: theme.colors.surfaceSecondary },
  mBtnSave: { backgroundColor: theme.colors.brand },
});
