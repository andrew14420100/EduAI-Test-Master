import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { IconButton, PrimaryButton, SectionTitle } from '@/components/Ui';

const supportedExtensions = ['pdf', 'txt', 'docx', 'jpg', 'jpeg', 'png', 'mp4'];

export default function LibraryScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { materials, addMaterial: saveToLibrary, removeMaterial } = useApp();

  const saveMaterial = (
    name: string,
    uri: string,
    kind: 'documento' | 'immagine' | 'video',
    size?: number,
  ) => {
    saveToLibrary({
      id: `${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
      name,
      uri,
      kind,
      size,
    });
  };

  const chooseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'video/mp4',
        'image/*',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    const extension = asset.name.split('.').pop()?.toLowerCase() ?? '';
    if (!supportedExtensions.includes(extension)) {
      Alert.alert('Formato non supportato', 'Scegli PDF, TXT, DOCX, JPG, PNG oppure MP4.');
      return;
    }

    const kind = extension === 'mp4'
      ? 'video'
      : ['jpg', 'jpeg', 'png'].includes(extension)
        ? 'immagine'
        : 'documento';
    saveMaterial(asset.name, asset.uri, kind, asset.size);
  };

  const chooseMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 1,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    const kind = asset.type === 'video' ? 'video' : 'immagine';
    saveMaterial(
      asset.fileName ?? (kind === 'video' ? 'video.mp4' : 'immagine.jpg'),
      asset.uri,
      kind,
      asset.fileSize,
    );
  };

  const addMaterial = () => {
    Alert.alert('Aggiungi materiale', 'Scegli il tipo di contenuto da importare.', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'File o documento', onPress: () => void chooseFile() },
      { text: 'Foto o video', onPress: () => void chooseMedia() },
    ]);
  };

  const generate = () => {
    if (!materials.length) {
      Alert.alert('Aggiungi prima un materiale', 'Carica un documento, un’immagine o un video per iniziare.');
      return;
    }
    router.push({ pathname: '/quiz', params: { materialId: materials[0].id } });
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 100 }]}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: c.primary }]}>MATERIALI</Text>
          <Text style={[styles.heading, { color: c.foreground }]}>La tua libreria</Text>
        </View>
        <IconButton name="plus" label="Aggiungi materiale" onPress={addMaterial} />
      </View>

      <Text style={[styles.intro, { color: c.mutedForeground }]}>
        Carica appunti, documenti, immagini o registrazioni dal tuo dispositivo.
      </Text>

      <Pressable
        testID="aggiungi-materiale"
        onPress={addMaterial}
        style={({ pressed }) => [styles.upload, { borderColor: c.primary, backgroundColor: c.accent, opacity: pressed ? 0.72 : 1 }]}
      >
        <View style={[styles.uploadIcon, { backgroundColor: c.primary }]}>
          <Feather name="upload" size={21} color={c.primaryForeground} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.uploadTitle, { color: c.foreground }]}>Aggiungi dai tuoi file</Text>
          <Text style={[styles.small, { color: c.mutedForeground }]}>PDF, TXT, DOCX, immagini e video MP4</Text>
        </View>
        <Feather name="chevron-right" size={20} color={c.foreground} />
      </Pressable>

      <SectionTitle eyebrow="Contenuti salvati" title={materials.length ? `${materials.length} materiali` : 'Nessun materiale'} />

      {materials.length ? materials.map((item) => (
        <View key={item.id} style={[styles.material, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.fileIcon, { backgroundColor: item.kind === 'video' ? c.secondary : c.accent }]}>
            <Feather name={item.kind === 'video' ? 'film' : item.kind === 'immagine' ? 'image' : 'file-text'} size={18} color={item.kind === 'video' ? c.foreground : c.accentForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.materialTitle, { color: c.foreground }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.small, { color: c.mutedForeground }]}>
              {item.kind.toUpperCase()}{item.size ? ` · ${(item.size / 1024 / 1024).toFixed(1)} MB` : ''}
            </Text>
          </View>
          <Pressable accessibilityLabel="Elimina materiale" onPress={() => removeMaterial(item.id)} hitSlop={12}>
            <Feather name="trash-2" size={18} color={c.destructive} />
          </Pressable>
        </View>
      )) : (
        <View style={[styles.empty, { backgroundColor: c.card }]}>
          <Feather name="folder" size={23} color={c.primary} />
          <Text style={[styles.emptyTitle, { color: c.foreground }]}>La libreria è vuota</Text>
          <Text style={[styles.small, { color: c.mutedForeground }]}>Tocca “Aggiungi dai tuoi file” per iniziare.</Text>
        </View>
      )}

      <View style={[styles.tip, { backgroundColor: c.card }]}>
        <Feather name="lock" size={18} color={c.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.tipTitle, { color: c.foreground }]}>I tuoi contenuti restano sul dispositivo</Text>
          <Text style={[styles.small, { color: c.mutedForeground }]}>Puoi rimuoverli in qualsiasi momento dalla libreria.</Text>
        </View>
      </View>
      <PrimaryButton onPress={generate}>Crea una verifica</PrimaryButton>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.6, marginBottom: 5 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 27, letterSpacing: -0.8 },
  intro: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20, maxWidth: 330 },
  upload: { borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  uploadIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  uploadTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, marginBottom: 4 },
  small: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  material: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  fileIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  materialTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginBottom: 4 },
  empty: { borderRadius: 18, padding: 20, gap: 7, alignItems: 'flex-start' },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  tip: { padding: 16, borderRadius: 18, flexDirection: 'row', gap: 12 },
  tipTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginBottom: 4 },
});