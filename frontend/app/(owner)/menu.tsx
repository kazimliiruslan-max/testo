import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Image, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { api, formatApiError } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

const PRESET_CATEGORIES = [
  'Starters', 'Mains', 'Pizza', 'Burgers', 'Sushi', 'Salads',
  'Desserts', 'Drinks', 'Sides', 'Vegan', 'Kids', 'Other',
];

interface MenuItem {
  id: string; name: string; description: string; price: number;
  delivery_fee_pct: number; display_price: number;
  category: string; image_url: string; available: boolean;
}

export default function OwnerMenu() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [customCategoryMode, setCustomCategoryMode] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const initialForm = {
    name: '', description: '', price: '', delivery_fee_pct: '0',
    category: 'Mains', image_url: '', image_base64: '',
  };
  const [form, setForm] = useState(initialForm);

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

  const openAdd = () => {
    setEditingId(null);
    setForm(initialForm);
    setCustomCategoryMode(false);
    setErr(null);
    setShowAdd(true);
  };

  const submit = async () => {
    if (!form.name || !form.price) return;
    setSaving(true);
    setErr(null);
    try {
      const payload: any = {
        name: form.name,
        description: form.description,
        price: parseFloat(form.price),
        delivery_fee_pct: parseFloat(form.delivery_fee_pct || '0'),
        category: form.category || 'Mains',
      };
      if (form.image_base64) payload.image_base64 = form.image_base64;
      else if (form.image_url) payload.image_url = form.image_url;

      if (editingId) {
        await api.patch(`/menu/${editingId}`, payload);
      } else {
        await api.post('/menu', payload);
      }
      setShowAdd(false);
      setForm(initialForm);
      setEditingId(null);
      load();
    } catch (e: any) {
      setErr(formatApiError(e, t('error')));
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async () => {
    setPickingImage(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setPickingImage(false); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6, base64: true, allowsEditing: true, aspect: [4, 3],
      });
      if (res.canceled || !res.assets?.[0]?.base64) return;
      setForm((f) => ({ ...f, image_base64: res.assets[0].base64!, image_url: '' }));
    } finally {
      setPickingImage(false);
    }
  };

  const previewSrc = form.image_base64
    ? `data:image/jpeg;base64,${form.image_base64}`
    : form.image_url;

  const del = async (id: string) => {
    await api.delete(`/menu/${id}`);
    load();
  };

  const toggleAvailability = async (item: MenuItem) => {
    // optimistic
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, available: !i.available } : i)));
    try {
      await api.patch(`/menu/${item.id}`, { available: !item.available });
    } catch {
      // revert on failure
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, available: item.available } : i)));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('tab_owner_menu')}</Text>
        <Pressable testID="add-menu-btn" onPress={openAdd} style={styles.headerAdd}>
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
            <View style={[styles.item, !item.available && styles.itemDisabled]} testID={`menu-item-${item.id}`}>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{item.name}</Text>
                  {!item.available && (
                    <View style={styles.outPill}>
                      <Ionicons name="close-circle" size={12} color="#fff" />
                      <Text style={styles.outPillTxt}>{t('outOfStock')}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.desc}>{item.description}</Text>
                <Text style={styles.price}>₺{item.price.toFixed(2)} · {item.category}</Text>
              </View>
              <View style={styles.actions}>
                <View style={styles.availWrap}>
                  <Switch
                    testID={`avail-toggle-${item.id}`}
                    value={item.available}
                    onValueChange={() => toggleAvailability(item)}
                    trackColor={{ false: theme.colors.surfaceTertiary, true: theme.colors.brand }}
                  />
                </View>
                <Pressable testID={`delete-item-${item.id}`} onPress={() => del(item.id)} style={styles.delBtn}>
                  <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                </Pressable>
              </View>
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
                <Text style={styles.modalTitle}>{editingId ? t('editMenuItem') : t('addMenuItem')}</Text>
                <TextInput testID="menu-name-input" style={styles.input} placeholder={t('itemName')} placeholderTextColor={theme.colors.onSurfaceTertiary} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
                <TextInput testID="menu-desc-input" style={styles.input} placeholder={t('description')} placeholderTextColor={theme.colors.onSurfaceTertiary} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} />
                <TextInput testID="menu-price-input" style={styles.input} placeholder={t('price')} placeholderTextColor={theme.colors.onSurfaceTertiary} keyboardType="decimal-pad" value={form.price} onChangeText={(v) => setForm({ ...form, price: v })} />
                <TextInput testID="menu-fee-input" style={styles.input} placeholder="Delivery fee % (e.g. 10)" placeholderTextColor={theme.colors.onSurfaceTertiary} keyboardType="decimal-pad" value={form.delivery_fee_pct} onChangeText={(v) => setForm({ ...form, delivery_fee_pct: v })} />
                {form.price && form.delivery_fee_pct && !isNaN(parseFloat(form.price)) && (
                  <Text style={{ color: theme.colors.brandDark, fontWeight: '700', marginBottom: theme.spacing.sm }}>
                    Customer will see: ₺{(parseFloat(form.price) * (1 + parseFloat(form.delivery_fee_pct || '0') / 100)).toFixed(2)}
                  </Text>
                )}

                <Text style={styles.fieldLabel}>{t('category').toUpperCase()}</Text>
                {!customCategoryMode ? (
                  <View style={styles.chipsRow}>
                    {PRESET_CATEGORIES.map((c) => {
                      const active = form.category === c;
                      return (
                        <Pressable
                          key={c}
                          testID={`cat-chip-${c}`}
                          onPress={() => setForm({ ...form, category: c })}
                          style={[styles.chip, active && styles.chipActive]}
                        >
                          <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{c}</Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      testID="cat-chip-custom"
                      onPress={() => { setCustomCategoryMode(true); setForm({ ...form, category: '' }); }}
                      style={[styles.chip, styles.chipCustom]}
                    >
                      <Ionicons name="add" size={14} color={theme.colors.brand} />
                      <Text style={[styles.chipTxt, { color: theme.colors.brand }]}>{t('customCategory')}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
                    <TextInput
                      testID="menu-category-input"
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      placeholder={t('customCategoryHint')}
                      placeholderTextColor={theme.colors.onSurfaceTertiary}
                      value={form.category}
                      onChangeText={(v) => setForm({ ...form, category: v })}
                      autoFocus
                    />
                    <Pressable
                      onPress={() => { setCustomCategoryMode(false); setForm({ ...form, category: 'Mains' }); }}
                      style={styles.pickBtn}
                    >
                      <Ionicons name="close" size={16} color={theme.colors.brand} />
                    </Pressable>
                  </View>
                )}

                <TextInput testID="menu-image-input" style={[styles.input, { marginTop: theme.spacing.md }]} placeholder={t('imageUrl')} placeholderTextColor={theme.colors.onSurfaceTertiary} value={form.image_url} onChangeText={(v) => setForm({ ...form, image_url: v, image_base64: '' })} />
                <Pressable testID="pick-image-btn" onPress={pickImage} style={styles.pickBtn} disabled={pickingImage}>
                  {pickingImage
                    ? <ActivityIndicator color={theme.colors.brand} />
                    : <><Ionicons name="image-outline" size={18} color={theme.colors.brand} /><Text style={styles.pickTxt}>{t('pickFromGallery')}</Text></>}
                </Pressable>
                {previewSrc ? (
                  <Image source={{ uri: previewSrc }} style={styles.imgPreview} resizeMode="cover" />
                ) : null}

                {err ? <Text style={{ color: theme.colors.error, textAlign: 'center', marginTop: 6 }}>{err}</Text> : null}

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
  itemDisabled: { opacity: 0.55 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' },
  outPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.colors.error, paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.pill },
  outPillTxt: { color: '#fff', fontWeight: '800', fontSize: theme.font.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  availWrap: { alignItems: 'center' },
  name: { fontSize: theme.font.lg, fontWeight: '700', color: theme.colors.onSurface },
  desc: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm },
  price: { color: theme.colors.brand, fontWeight: '700', marginTop: 4 },
  delBtn: { padding: theme.spacing.sm },
  empty: { color: theme.colors.onSurfaceTertiary, textAlign: 'center', marginTop: 60 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', padding: theme.spacing.xl, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalTitle: { fontSize: theme.font.xl, fontWeight: '800', marginBottom: theme.spacing.md, color: theme.colors.onSurface },
  input: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, padding: theme.spacing.md, marginBottom: theme.spacing.sm, fontSize: theme.font.base, color: theme.colors.onSurface },
  fieldLabel: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceSecondary },
  chipActive: { backgroundColor: theme.colors.brand },
  chipTxt: { fontWeight: '700', color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm },
  chipTxtActive: { color: '#fff' },
  chipCustom: { borderWidth: 1, borderColor: theme.colors.brand, borderStyle: 'dashed', backgroundColor: 'transparent' },
  modalActions: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.lg },
  mBtn: { flex: 1, padding: theme.spacing.md, borderRadius: theme.radius.pill, alignItems: 'center' },
  mBtnCancel: { backgroundColor: theme.colors.surfaceSecondary },
  mBtnSave: { backgroundColor: theme.colors.brand },
  pickBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.brand, borderStyle: 'dashed', marginBottom: theme.spacing.sm },
  pickTxt: { color: theme.colors.brand, fontWeight: '700' },
  imgPreview: { width: '100%', height: 140, borderRadius: theme.radius.md, marginBottom: theme.spacing.sm },
});
