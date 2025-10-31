// App.js
// Single-file Expo app — Lightnovel reader (Madara-like, RTL, dark)
// Features implemented per request:
// - Tabs: Updates / Library / Settings
// - Infinite scroll for updates (API /series)
// - Full-width cover with blurred background
// - RTL layout, Arabic Cairo font
// - HTML -> clean paragraphs (removes &nbsp;, <br>, <p>, #123..., &lt; &gt; etc.)
// - Favorites saved in AsyncStorage and shown in Library
// Usage: install dependencies described above, then `npx expo start`.

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Dimensions,
  I18nManager,
  SafeAreaView,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

// Optional font (Cairo). If you installed @expo-google-fonts/cairo & expo-font, uncomment.
import { useFonts, Cairo_400Regular, Cairo_700Bold } from "@expo-google-fonts/cairo";

const API_BASE = "https://free.kolnovel.com/wp-json/lightnovel/v1";
const WP_BASE = "https://free.kolnovel.com/wp-json/wp/v2";
const FAVORITES_KEY = "@ln_favorites_v1";

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();
const { width: SCREEN_W } = Dimensions.get("window");

// Force RTL optionally (uncomment if you want the whole UI forced RTL).
// I18nManager.allowRTL(true);
// I18nManager.forceRTL(true);

// ------------------ Helpers: HTML -> paragraphs cleaner ------------------
function htmlToParagraphs(input = "") {
  if (!input) return [];
  let s = input;

  // Normalize some entities
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/gi, "&");
  s = s.replace(/&#39;/gi, "'");
  s = s.replace(/&quot;/gi, '"');
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/gi, ">");

  // Remove style/scripts if any
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");

  // Replace common block tags with newlines
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/p>/gi, "\n\n");
  s = s.replace(/<\/div>/gi, "\n\n");
  s = s.replace(/<\/h[1-6]>/gi, "\n\n");

  // Remove opening paragraph/div/headers tags
  s = s.replace(/<p[^>]*>/gi, "");
  s = s.replace(/<div[^>]*>/gi, "");
  s = s.replace(/<h[1-6][^>]*>/gi, "");

  // Remove all remaining HTML tags
  s = s.replace(/<[^>]+>/g, "");

  // Remove weird codes like #76776 or sequences of multiple & leftover
  s = s.replace(/#\d{2,}/g, "");
  s = s.replace(/&{2,}/g, "&");

  // Normalize whitespace and newlines
  s = s.replace(/\r/g, "");
  s = s.replace(/\t/g, " ");
  // collapse many spaces
  s = s.replace(/ {2,}/g, " ");
  // collapse many newlines to max two
  s = s.replace(/\n{3,}/g, "\n\n");
  // trim
  s = s.trim();

  // Split into paragraphs by double newline or single newline with long line break
  const paras = s.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return paras;
}

function joinParagraphs(input = "") {
  return htmlToParagraphs(input).join("\n\n");
}

// ------------------ AsyncStorage favorites ------------------
async function saveFavorites(favs) {
  try {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favs || []));
  } catch (e) {
    console.warn("saveFavorites", e);
  }
}
async function loadFavorites() {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.warn("loadFavorites", e);
    return [];
  }
}

// ------------------ Theme (Madara-like clean dark) ------------------
const THEME = {
  bg: "#0f1113", // dark but not pure black
  card: "#17191c",
  text: "#e6e6e6",
  muted: "#9aa0a6",
  accent: "#7c4dff", // subtle purple accent
  btnTextDark: "#0b0b0f",
};

// ------------------ Updates Tab (infinite scroll) ------------------
function UpdatesScreen({ navigation }) {
  const [page, setPage] = useState(1);
  const [novels, setNovels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNovels = async (pageNum = 1, refresh = false) => {
    if (loading || (!hasMore && !refresh)) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/series?page=${pageNum}&per_page=20`);
      const data = await res.json();
      const list = data.novels || [];
      setNovels((prev) => (refresh ? list : [...prev, ...list]));
      setHasMore(pageNum < (data.total_pages || 1));
      setPage(pageNum);
    } catch (e) {
      console.warn("fetchNovels error", e);
    } finally {
      setLoading(false);
      if (refresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNovels();
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNovels(1, true);
  }, []);

  const handleLoadMore = () => {
    if (!loading && hasMore) fetchNovels(page + 1);
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: THEME.card }]}
      onPress={() => navigation.navigate("SeriesDetails", { id: item.id })}
    >
      <Image source={{ uri: item.cover_image }} style={styles.cardThumb} />
      <View style={{ flex: 1, paddingHorizontal: 12, justifyContent: "center" }}>
        <Text style={[styles.cardTitle, { color: THEME.text }]}>{item.name}</Text>
        <Text style={[styles.cardDesc, { color: THEME.muted }]} numberOfLines={3}>
          {joinParagraphs(item.description)}
        </Text>
        <Text style={[styles.cardMeta, { color: THEME.muted }]}>🕒 {item.last_update}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: THEME.bg }}>
      <FlatList
        data={novels}
        keyExtractor={(i) => i.id.toString()}
        renderItem={renderItem}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.6}
        ListFooterComponent={() =>
          loading ? <ActivityIndicator style={{ margin: 16 }} color={THEME.accent} /> : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={THEME.accent} />
        }
        contentContainerStyle={{ padding: 10 }}
      />
    </SafeAreaView>
  );
}

// ------------------ Library Tab (Favorites) ------------------
function LibraryScreen({ navigation }) {
  const [favs, setFavs] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const arr = await loadFavorites();
    setFavs(arr || []);
    setLoading(false);
  };

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      load();
    });
    load();
    return unsub;
  }, [navigation]);

  const remove = async (id) => {
    const next = (favs || []).filter((x) => x.id !== id);
    setFavs(next);
    await saveFavorites(next);
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 50 }} color={THEME.accent} />;

  if (!favs || favs.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: THEME.bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: THEME.muted }}>لم تضف أي رواية للمكتبة بعد.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: THEME.bg }}>
      <FlatList
        data={favs}
        keyExtractor={(i) => i.id.toString()}
        contentContainerStyle={{ padding: 10 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: THEME.card }]}
            onPress={() => navigation.navigate("SeriesDetails", { id: item.id })}
          >
            <Image source={{ uri: item.cover_image }} style={styles.cardThumb} />
            <View style={{ flex: 1, paddingHorizontal: 12, justifyContent: "center" }}>
              <Text style={[styles.cardTitle, { color: THEME.text }]}>{item.name}</Text>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8 }}>
                <TouchableOpacity
                  onPress={() => remove(item.id)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 6,
                    backgroundColor: "#221f2d",
                  }}
                >
                  <Text style={{ color: "#fff" }}>إزالة</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

// ------------------ Settings placeholder ------------------
function SettingsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: THEME.bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: THEME.muted }}>الإعدادات (قريبًا)</Text>
    </View>
  );
}

// ------------------ Series Details (full-width cover + blurred bg) ------------------
function SeriesDetails({ route, navigation }) {
  const { id } = route.params;
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API_BASE}/series/${id}`);
        const data = await r.json();
        if (!mounted) return;
        setDetails(data);
        const favs = await loadFavorites();
        setIsFav((favs || []).some((x) => x.id === data.id));
      } catch (e) {
        console.warn("series details", e);
      } finally {
        mounted && setLoading(false);
      }
    })();
    return () => (mounted = false);
  }, [id]);

  const toggleFav = async () => {
    try {
      const favs = await loadFavorites();
      if (isFav) {
        const next = (favs || []).filter((x) => x.id !== details.id);
        await saveFavorites(next);
        setIsFav(false);
        Alert.alert("تم", "تمت إزالة الرواية من المكتبة");
      } else {
        const next = [{ id: details.id, name: details.name, cover_image: details.cover_image }, ...(favs || [])];
        await saveFavorites(next);
        setIsFav(true);
        Alert.alert("تم", "تمت إضافة الرواية إلى المكتبة");
      }
    } catch (e) {
      console.warn("toggleFav", e);
    }
  };

  if (loading || !details) return <ActivityIndicator style={{ marginTop: 50 }} color={THEME.accent} />;

  const chapters = details.chapters || [];
  const paras = htmlToParagraphs(details.description || "");

  return (
    <ScrollView style={{ flex: 1, backgroundColor: THEME.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.headerWrap}>
        <Image source={{ uri: details.cover_image }} style={styles.headerBg} blurRadius={18} />
        <View style={styles.headerOverlay} />
        <View style={styles.coverContainerFull}>
          <Image source={{ uri: details.cover_image }} style={styles.coverImageFull} />
        </View>
      </View>

      <View style={{ padding: 14 }}>
        <Text style={[styles.seriesTitle, { color: THEME.text }]}>{details.name}</Text>
        <Text style={[styles.seriesMeta, { color: THEME.muted }]}>المؤلف: {details.author || "غير معروف"}</Text>
        <Text style={[styles.seriesMeta, { color: THEME.muted }]}>الحالة: {details.status || "؟"}</Text>
        <Text style={[styles.seriesMeta, { color: THEME.muted }]}>السنة: {details.year || "؟"}</Text>

        <View style={{ marginTop: 12 }}>
          {paras.map((p, i) => (
            <Text key={i} style={styles.paragraph}>
              {p}
            </Text>
          ))}
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 14 }}>
          <TouchableOpacity style={styles.secondaryButton} onPress={toggleFav}>
            <Text style={{ color: isFav ? THEME.btnTextDark : "#fff", fontWeight: "700" }}>
              {isFav ? "موجود في المكتبة" : "أضف للمكتبة"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              if (chapters.length) navigation.navigate("Chapter", { id: chapters[0].id, title: chapters[0].title, seriesId: id, chapters });
              else Alert.alert("لا توجد فصول", "لا يوجد فصول لهذه الرواية بعد.");
            }}
          >
            <Text style={{ fontWeight: "700", color: THEME.btnTextDark }}>ابدأ القراءة</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ marginTop: 16, fontSize: 16, fontWeight: "700", color: THEME.text }}>الفصول</Text>
        {chapters.map((ch) => (
          <TouchableOpacity
            key={ch.id}
            style={[styles.chapterItem, { backgroundColor: THEME.card }]}
            onPress={() => navigation.navigate("Chapter", { id: ch.id, title: ch.title, seriesId: id, chapters })}
          >
            <Text style={{ flex: 1, color: THEME.text }}>{ch.title}</Text>
            <Text style={{ color: THEME.muted }}>{ch.date}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

// ------------------ Chapter Screen ------------------
function ChapterScreen({ route, navigation }) {
  const { id, title, seriesId, chapters: passedChapters } = route.params;
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chapters, setChapters] = useState(passedChapters || []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`${WP_BASE}/posts/${id}`);
        const p = await r.json();
        if (!mounted) return;
        setPost(p);

        if ((!passedChapters || passedChapters.length === 0) && Array.isArray(p.categories) && p.categories.length) {
          const catId = p.categories[0];
          const rr = await fetch(`${WP_BASE}/posts?categories=${catId}&per_page=200`);
          const posts = await rr.json();
          const mapped = posts.map((pp) => ({ id: pp.id, title: pp.title.rendered, date: pp.date }));
          mapped.sort((a, b) => new Date(a.date) - new Date(b.date));
          setChapters(mapped);
        }
      } catch (e) {
        console.warn("fetch post", e);
      } finally {
        mounted && setLoading(false);
      }
    })();
    return () => (mounted = false);
  }, [id]);

  if (loading || !post) return <ActivityIndicator style={{ marginTop: 50 }} color={THEME.accent} />;

  const paras = htmlToParagraphs(post.content?.rendered || "");
  const idx = chapters.findIndex((c) => c.id === id);

  const goToIndex = (newIdx) => {
    if (newIdx < 0 || newIdx >= chapters.length) return;
    const ch = chapters[newIdx];
    navigation.replace("Chapter", { id: ch.id, title: ch.title, seriesId, chapters });
  };

  return (
    <View style={{ flex: 1, backgroundColor: THEME.bg }}>
      <ScrollView style={{ padding: 16 }} contentContainerStyle={{ paddingBottom: 100 }}>
        <Text style={[styles.chapterTitle, { color: THEME.text }]}>{title}</Text>
        <Text style={[styles.chapterDate, { color: THEME.muted }]}>{new Date(post.date).toLocaleString("ar-EG")}</Text>

        {paras.map((p, i) => (
          <Text key={i} style={styles.paragraph}>
            {p}
          </Text>
        ))}
      </ScrollView>

      <View style={[styles.chapterNav, { backgroundColor: "#08080a" }]}>
        <TouchableOpacity onPress={() => goToIndex(idx - 1)} style={styles.navBtn}>
          <Text style={{ color: THEME.text }}>السابق</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => goToIndex(idx + 1)} style={[styles.navBtnPrimary, { backgroundColor: THEME.accent }]}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>التالي</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ------------------ Root: Tabs + Stack ------------------
function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} initialRouteName="Updates">
      <Tab.Screen name="Updates" component={UpdatesScreen} options={{ title: "التحديثات" }} />
      <Tab.Screen name="Library" component={LibraryScreen} options={{ title: "المكتبة" }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: "الإعدادات" }} />
    </Tab.Navigator>
  );
}

export default function App() {
  // load font (optional). If fonts weren't installed, the hook returns false and we fall back automatically.
  const [fontsLoaded] = useFonts({
    Cairo_400Regular,
    Cairo_700Bold,
  });

  if (!fontsLoaded) {
    return <ActivityIndicator style={{ flex: 1 }} color={THEME.accent} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="HomeTabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="SeriesDetails" component={SeriesDetails} options={{ title: "تفاصيل الرواية" }} />
        <Stack.Screen name="Chapter" component={ChapterScreen} options={{ title: "الفصل" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ------------------ Styles ------------------
const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: THEME.card,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
    elevation: 2,
  },
  cardThumb: {
    width: 96,
    height: 130,
    backgroundColor: "#333",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", fontFamily: "Cairo_400Regular" },
  cardDesc: { marginTop: 6, textAlign: "right", fontFamily: "Cairo_400Regular" },
  cardMeta: { marginTop: 8, fontSize: 12, textAlign: "right", fontFamily: "Cairo_400Regular" },

  headerWrap: {
    height: 340,
    backgroundColor: THEME.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBg: {
    position: "absolute",
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  headerOverlay: {
    position: "absolute",
    width: "100%",
    height: "100%",
    backgroundColor: "#0006",
  },
  coverContainerFull: {
    width: SCREEN_W * 0.96,
    height: 300,
    borderRadius: 10,
    overflow: "hidden",
    elevation: 10,
  },
  coverImageFull: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  seriesTitle: { fontSize: 20, fontWeight: "800", textAlign: "center", marginTop: 12, fontFamily: "Cairo_700Bold" },
  seriesMeta: { textAlign: "center", marginTop: 4, fontFamily: "Cairo_400Regular" },

  primaryButton: {
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButton: {
    backgroundColor: "#23222a",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
  },

  paragraph: {
    color: THEME.text,
    lineHeight: 28,
    marginBottom: 14,
    textAlign: "right",
    fontSize: 17,
    fontFamily: "Cairo_400Regular",
  },

  chapterItem: {
    flexDirection: "row",
    padding: 12,
    marginTop: 8,
    borderRadius: 8,
    alignItems: "center",
  },

  chapterNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    padding: 12,
    justifyContent: "space-between",
  },
  navBtn: {
    padding: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
  },
  navBtnPrimary: {
    padding: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
  },

  chapterTitle: { fontSize: 22, fontWeight: "800", textAlign: "right", marginBottom: 6, fontFamily: "Cairo_700Bold" },
  chapterDate: { textAlign: "right", marginBottom: 12, fontFamily: "Cairo_400Regular" },
});
