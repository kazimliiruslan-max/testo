import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Lang = 'en' | 'tr';

const strings = {
  en: {
    // Auth
    welcome: 'Welcome to DirectDine',
    subtitle: '0% commission — pay at the door',
    login: 'Login',
    register: 'Register',
    email: 'Email',
    password: 'Password',
    name: 'Full name',
    phone: 'Phone (optional)',
    restaurant_name: 'Restaurant name',
    signIn: 'Sign In',
    signUp: 'Create Account',
    noAccount: "Don't have an account?",
    haveAccount: 'Already have an account?',
    selectRole: 'I am a...',
    role_customer: 'Customer',
    role_owner: 'Restaurant Owner',
    role_courier: 'Courier',
    courierRegisterHint: 'Couriers are added by their restaurant owner.',
    // Common
    logout: 'Log out',
    language: 'Language',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    add: 'Add',
    loading: 'Loading...',
    // Customer
    tab_home: 'Home',
    tab_orders: 'Orders',
    tab_profile: 'Profile',
    searchPlaceholder: 'Search restaurants...',
    allCuisines: 'All',
    noCommission: '0% Commission',
    minDelivery: 'min',
    menu: 'Menu',
    addToCart: 'Add',
    cart: 'Cart',
    checkout: 'Checkout',
    cartEmpty: 'Your cart is empty',
    total: 'Total',
    deliveryAddress: 'Delivery address',
    notes: 'Notes (optional)',
    placeOrder: 'Place Order',
    payAtDoor: 'Pay at Door · Cash Only',
    payAtDoorDesc: 'No platform commission. Pay the courier when your food arrives.',
    orderPlaced: 'Order placed successfully!',
    trackOrder: 'Track Order',
    noOrders: 'No orders yet',
    status_pending: 'Pending',
    status_accepted: 'Accepted',
    status_preparing: 'Preparing',
    status_out_for_delivery: 'Out for delivery',
    status_delivered: 'Delivered',
    status_cancelled: 'Cancelled',
    // Owner
    tab_owner_orders: 'Orders',
    tab_owner_menu: 'Menu',
    tab_owner_couriers: 'Couriers',
    subscriptionActive: 'Subscription Active',
    activeOrders: 'Active Orders',
    totalCouriers: 'Couriers',
    assignCourier: 'Assign Courier',
    accept: 'Accept',
    startPreparing: 'Start Preparing',
    reject: 'Reject',
    addMenuItem: 'Add Menu Item',
    itemName: 'Item name',
    price: 'Price',
    description: 'Description',
    category: 'Category',
    imageUrl: 'Image URL (optional)',
    addCourier: 'Add Courier',
    // Courier
    tab_courier_deliveries: 'Deliveries',
    pickedUp: 'Picked Up',
    onTheWay: 'On the Way',
    delivered: 'Delivered',
    noDeliveries: 'No deliveries assigned',
    updateLocation: 'Update My Location',
    myLocationUpdated: 'Location updated',
    // Errors
    invalidCredentials: 'Invalid email or password',
    error: 'Something went wrong',
  },
  tr: {
    welcome: 'DirectDine\'e Hoş Geldiniz',
    subtitle: '%0 komisyon — kapıda ödeme',
    login: 'Giriş',
    register: 'Kayıt Ol',
    email: 'E-posta',
    password: 'Şifre',
    name: 'Ad Soyad',
    phone: 'Telefon (opsiyonel)',
    restaurant_name: 'Restoran adı',
    signIn: 'Giriş Yap',
    signUp: 'Hesap Oluştur',
    noAccount: 'Hesabınız yok mu?',
    haveAccount: 'Zaten hesabınız var mı?',
    selectRole: 'Ben bir...',
    role_customer: 'Müşteri',
    role_owner: 'Restoran Sahibi',
    role_courier: 'Kurye',
    courierRegisterHint: 'Kuryeler restoran sahipleri tarafından eklenir.',
    logout: 'Çıkış',
    language: 'Dil',
    save: 'Kaydet',
    cancel: 'İptal',
    delete: 'Sil',
    add: 'Ekle',
    loading: 'Yükleniyor...',
    tab_home: 'Ana Sayfa',
    tab_orders: 'Siparişler',
    tab_profile: 'Profil',
    searchPlaceholder: 'Restoran ara...',
    allCuisines: 'Tümü',
    noCommission: '%0 Komisyon',
    minDelivery: 'dk',
    menu: 'Menü',
    addToCart: 'Ekle',
    cart: 'Sepet',
    checkout: 'Öde',
    cartEmpty: 'Sepetiniz boş',
    total: 'Toplam',
    deliveryAddress: 'Teslimat adresi',
    notes: 'Notlar (opsiyonel)',
    placeOrder: 'Sipariş Ver',
    payAtDoor: 'Kapıda Ödeme · Sadece Nakit',
    payAtDoorDesc: 'Platform komisyonu yok. Yemek geldiğinde kuryeye ödeyin.',
    orderPlaced: 'Siparişiniz alındı!',
    trackOrder: 'Siparişi Takip Et',
    noOrders: 'Henüz sipariş yok',
    status_pending: 'Beklemede',
    status_accepted: 'Onaylandı',
    status_preparing: 'Hazırlanıyor',
    status_out_for_delivery: 'Yolda',
    status_delivered: 'Teslim edildi',
    status_cancelled: 'İptal edildi',
    tab_owner_orders: 'Siparişler',
    tab_owner_menu: 'Menü',
    tab_owner_couriers: 'Kuryeler',
    subscriptionActive: 'Üyelik Aktif',
    activeOrders: 'Aktif Siparişler',
    totalCouriers: 'Kuryeler',
    assignCourier: 'Kurye Ata',
    accept: 'Onayla',
    startPreparing: 'Hazırlamaya Başla',
    reject: 'Reddet',
    addMenuItem: 'Menü Öğesi Ekle',
    itemName: 'Ürün adı',
    price: 'Fiyat',
    description: 'Açıklama',
    category: 'Kategori',
    imageUrl: 'Resim URL (opsiyonel)',
    addCourier: 'Kurye Ekle',
    tab_courier_deliveries: 'Teslimatlar',
    pickedUp: 'Alındı',
    onTheWay: 'Yolda',
    delivered: 'Teslim Edildi',
    noDeliveries: 'Atanmış teslimat yok',
    updateLocation: 'Konumumu Güncelle',
    myLocationUpdated: 'Konum güncellendi',
    invalidCredentials: 'Geçersiz e-posta veya şifre',
    error: 'Bir hata oluştu',
  },
};

type Keys = keyof typeof strings.en;

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: Keys) => string;
}

const Ctx = createContext<I18nCtx | undefined>(undefined);
const STORAGE_KEY = 'directdine_lang';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'en' || v === 'tr') setLangState(v);
    });
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback((k: Keys) => (strings[lang][k] ?? strings.en[k] ?? k) as string, [lang]);

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useI18n must be inside I18nProvider');
  return c;
}
