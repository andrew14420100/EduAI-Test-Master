import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { AppModal } from '@/components/AppModal';
import { IconButton, PrimaryButton, SectionTitle } from '@/components/Ui';
import { Material, MaterialKind, UploadMaterialInput, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type ImportAsset = { name: string; uri: string; size?: number; mimeType?: string | null };
type UploadItem = { id: string; name: string; kind: MaterialKind; progress: number; status: 'caricamento' | 'completato' | 'errore' };
type LibraryModal =
  | { kind: 'sorgente' }
  | { kind: 'messaggio'; title: string; message: string; icon: 'warning' | 'circle-check' | 'info' }
  | { kind: 'elimina'; material: Material }
  | { kind: 'generazione' };

const supportedExtensions = ['pdf', 'txt', 'docx', 'jpg', 'jpeg', 'png', 'heic', 'webp', 'mp4', 'mov', 'm4v', 'mp3', 'm4a', 'wav', 'aac'];
const imageExtensions = ['jpg', 'jpeg', 'png', 'heic', 'webp'];
const videoExtensions = ['mp4', 'mov', 'm4v'];
const audioExtensions = ['mp3', 'm4a', 'wav', 'aac'];

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function contentTypeOf(asset: ImportAsset, kind: MaterialKind) {
  if (asset.mimeType) return asset.mimeType;
  const extension = extensionOf(asset.name);
  const known: Record<string, string> = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    heic: 'image/heic',
    webp: 'image/webp',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    aac: 'audio/aac',
  };
  return known[extension] ?? (kind === 'documento' ? 'application/octet-stream' : `${kind}/*`);
}

function kindOf(asset: ImportAsset): MaterialKind | null {
  const extension = extensionOf(asset.name);
  if (imageExtensions.includes(extension) || asset.mimeType?.startsWith('image/')) return 'immagine';
  if (videoExtensions.includes(extension) || asset.mimeType?.startsWith('video/')) return 'video';
  if (audioExtensions.includes(extension) || asset.mimeType?.startsWith('audio/')) return 'audio';
  if (['pdf', 'txt', 'docx'].includes(extension)) return 'documento';
  return null;
}

function materialIcon(kind: MaterialKind) {
  if (kind === 'immagine') return 'image' as const;
  if (kind === 'video') return 'video' as const;
  if (kind === 'audio') return 'audio' as const;
  return 'file' as const;
}

function automaticTitle(materials: Array<{ name: string }>) {
  const cleanNames = materials.map((material) => material.name.replace(/\.[^/.]+$/, '').trim()).filter(Boolean);
  if (!cleanNames.length) return 'Pacchetto di studio';
  if (cleanNames.length === 1) return cleanNames[0];
  if (cleanNames.length === 2) return `${cleanNames[0]} + ${cleanNames[1]}`;
  return `${cleanNames[0]} + ${cleanNames[1]} e altri ${cleanNames.length - 2}`;
}

export default function LibraryScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const {
    materials,
    studyGroups,
    uploadMaterials,
    removeMaterial,
    retryMaterialAnalysis,
    generateLabsForMaterials,
  } = useApp();
  const mounted = useRef(true);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modal, setModal] = useState<LibraryModal | null>(null);
  const [generatingLabs, setGeneratingLabs] = useState(false);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const selectedMaterials = useMemo(
    () => materials.filter((material) => selectedIds.includes(material.id)),
    [materials, selectedIds],
  );
  const readySelectedMaterials = useMemo(
    () => selectedMaterials.filter((material) => material.isStudyReady),
    [selectedMaterials],
  );
  const groupTitle = useMemo(() => automaticTitle(selectedMaterials), [selectedMaterials]);
  const availableGroups = useMemo(
    () => studyGroups
      .map((group) => ({
        ...group,
        materialIds: group.materialIds.filter((id) => materials.some((material) => material.id === id)),
      }))
      .filter((group) => group.materialIds.length),
    [materials, studyGroups],
  );
  const uploadsInProgress = uploads.some((item) => item.status === 'caricamento');

  const importAssets = async (assets: ImportAsset[]) => {
    const accepted = assets
      .map((asset) => ({ asset, kind: kindOf(asset) }))
      .filter((entry): entry is { asset: ImportAsset; kind: MaterialKind } => Boolean(entry.kind));
    const rejectedCount = assets.length - accepted.length;

    if (!accepted.length) {
      setModal({
        kind: 'messaggio',
        title: 'Formato non supportato',
        message: 'Scegli PDF, TXT, DOCX, immagini, video oppure file audio MP3, M4A, WAV e AAC.',
        icon: 'warning',
      });
      return;
    }

    const pendingMaterials = accepted.map(({ asset, kind }, index): UploadMaterialInput => ({
      clientId: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      name: asset.name,
      uri: asset.uri,
      kind,
      size: asset.size,
      contentType: contentTypeOf(asset, kind),
    }));
    const uploadRows = pendingMaterials.map((material): UploadItem => ({
      id: material.clientId,
      name: material.name,
      kind: material.kind,
      progress: 1,
      status: 'caricamento',
    }));

    setUploads(uploadRows);
    const result = await uploadMaterials(
      pendingMaterials,
      automaticTitle(pendingMaterials),
      (clientId, progress) => {
        if (!mounted.current) return;
        setUploads((current) => current.map((item) => item.id === clientId
          ? {
            ...item,
            progress: progress < 0 ? item.progress : progress,
            status: progress < 0 ? 'errore' : progress === 100 ? 'completato' : 'caricamento',
          }
          : item));
      },
    );

    if (!mounted.current) return;
    if (!result.ok) {
      setUploads((current) => current.map((item) => item.status === 'caricamento' ? { ...item, status: 'errore' } : item));
      setModal({ kind: 'messaggio', title: 'Caricamento non riuscito', message: result.message, icon: 'warning' });
      return;
    }
    setSelectedIds([]);
    setModal({
      kind: 'messaggio',
      title: pendingMaterials.length === 1 ? 'Materiale importato' : `${pendingMaterials.length} materiali importati`,
      message: rejectedCount
        ? `${rejectedCount} file non supportati sono stati ignorati. Gli altri sono stati salvati e la loro analisi è iniziata.`
        : 'Tutti i file sono stati salvati online. L’analisi o la trascrizione continua in background.',
      icon: 'circle-check',
    });
  };

  const chooseFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'text/plain',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/*',
          'video/*',
          'audio/*',
        ],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      await importAssets(result.assets.map((asset) => ({
        name: asset.name,
        uri: asset.uri,
        size: asset.size,
        mimeType: asset.mimeType,
      })));
    } catch {
      setModal({ kind: 'messaggio', title: 'Importazione non riuscita', message: 'Non è stato possibile leggere i file selezionati. Riprova.', icon: 'warning' });
    }
  };

  const chooseMedia = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 1,
        allowsMultipleSelection: true,
        selectionLimit: 0,
      });
      if (result.canceled) return;
      await importAssets(result.assets.map((asset, index) => ({
        name: asset.fileName ?? (asset.type === 'video' ? `video-${index + 1}.mp4` : `immagine-${index + 1}.jpg`),
        uri: asset.uri,
        size: asset.fileSize,
        mimeType: asset.mimeType,
      })));
    } catch {
      setModal({ kind: 'messaggio', title: 'Galleria non disponibile', message: 'Non è stato possibile aprire foto e video. Controlla i permessi del dispositivo e riprova.', icon: 'warning' });
    }
  };

  const toggleMaterial = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const retryAnalysis = async (material: Material) => {
    const result = await retryMaterialAnalysis(material.id);
    if (!result.ok) {
      setModal({ kind: 'messaggio', title: 'Analisi non riavviata', message: result.message, icon: 'warning' });
    }
  };

  const askToGenerate = () => {
    if (!selectedMaterials.length) {
      setModal({ kind: 'messaggio', title: 'Seleziona i materiali', message: 'Scegli almeno un file dalla libreria prima di preparare il contenuto di studio.', icon: 'warning' });
      return;
    }
    setModal({ kind: 'generazione' });
  };

  const generateSelectedLabs = async () => {
    if (!readySelectedMaterials.length) {
      setModal({
        kind: 'messaggio',
        title: 'Materiali non pronti',
        message: 'Attendi che almeno un materiale termini l’analisi o la trascrizione.',
        icon: 'warning',
      });
      return;
    }
    setGeneratingLabs(true);
    setModal(null);
    const result = await generateLabsForMaterials();
    setGeneratingLabs(false);
    const created = result.ok ? (result.created ?? 0) : 0;
    const failed = result.ok ? 0 : readySelectedMaterials.length;
    const failureMessage = 'message' in result ? result.message : 'riprova più tardi';
    setModal({
      kind: 'messaggio',
      title: failed ? 'Laboratori creati parzialmente' : 'Laboratori pronti',
      message: failed
        ? `${failed} materiali non sono stati elaborati: ${failureMessage}.`
        : created
          ? `${created} esercizi pratici generati usando ${result.materialCount ?? readySelectedMaterials.length} materiali.`
          : 'I laboratori per questi materiali sono già disponibili.',
      icon: failed ? 'warning' : 'circle-check',
    });
  };

  const prepareContent = (mode: 'verifica' | 'flashcard') => {
    setModal(null);
    router.push({
      pathname: '/quiz',
      params: {
        materialIds: selectedMaterials.map((material) => material.id).join(','),
        mode,
        title: groupTitle,
      },
    });
  };

  const modalProps = (() => {
    if (!modal) return null;
    if (modal.kind === 'sorgente') {
      return {
        title: 'Aggiungi materiali',
        message: 'Puoi selezionare più elementi contemporaneamente.',
        icon: 'upload' as const,
        actions: [
          { label: 'File, documenti o audio', variant: 'primaria' as const, onPress: () => { setModal(null); void chooseFile(); } },
          { label: 'Foto e video', onPress: () => { setModal(null); void chooseMedia(); } },
          { label: 'Annulla', onPress: () => setModal(null) },
        ],
      };
    }
    if (modal.kind === 'elimina') {
      return {
        title: 'Rimuovere il materiale?',
        message: `${modal.material.name} verrà eliminato dalla tua libreria online.`,
        icon: 'trash' as const,
        actions: [
          {
            label: 'Elimina',
            variant: 'pericolo' as const,
            onPress: () => {
              const materialId = modal.material.id;
              setModal(null);
              void removeMaterial(materialId).then((result) => {
                if (result.ok) {
                  setSelectedIds((current) => current.filter((id) => id !== materialId));
                } else {
                  setModal({ kind: 'messaggio', title: 'Eliminazione non riuscita', message: result.message, icon: 'warning' });
                }
              });
            },
          },
          { label: 'Annulla', onPress: () => setModal(null) },
        ],
      };
    }
    if (modal.kind === 'generazione') {
      return {
        title: groupTitle,
        message: `${selectedMaterials.length} ${selectedMaterials.length === 1 ? 'materiale selezionato' : 'materiali selezionati'}. Scegli cosa vuoi preparare.`,
        icon: 'generate' as const,
        actions: [
          { label: 'Prepara una verifica', variant: 'primaria' as const, onPress: () => prepareContent('verifica') },
          { label: 'Prepara le flashcard', onPress: () => prepareContent('flashcard') },
            { label: 'Genera laboratori', onPress: () => { void generateSelectedLabs(); } },
          { label: 'Annulla', onPress: () => setModal(null) },
        ],
      };
    }
    return {
      title: modal.title,
      message: modal.message,
      icon: modal.icon,
      actions: [{ label: 'Continua', variant: 'primaria' as const, onPress: () => setModal(null) }],
    };
  })();

  return (
    <>
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.eyebrow, { color: c.primary }]}>GENERA</Text>
            <Text style={[styles.heading, { color: c.foreground }]}>I tuoi materiali</Text>
          </View>
          <IconButton name="plus" label="Aggiungi materiali" onPress={() => setModal({ kind: 'sorgente' })} />
        </View>

        <Text style={[styles.intro, { color: c.mutedForeground }]}>
          Importa più documenti, immagini, video o audio e preparali come un unico argomento.
        </Text>

        <Pressable
          testID="aggiungi-materiali"
          onPress={() => setModal({ kind: 'sorgente' })}
          style={({ pressed }) => [styles.upload, { borderColor: c.primary, backgroundColor: c.accent, opacity: pressed ? 0.72 : 1 }]}
        >
          <View style={[styles.uploadIcon, { backgroundColor: c.primary }]}>
            <AppIcon name="upload" size={19} color={c.primaryForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.uploadTitle, { color: c.foreground }]}>Importa più file insieme</Text>
            <Text style={[styles.small, { color: c.mutedForeground }]}>PDF, DOCX, immagini, video e audio</Text>
          </View>
          <AppIcon name="chevron-right" size={16} color={c.foreground} />
        </Pressable>

        {uploads.length ? (
          <View>
            <SectionTitle
              eyebrow={uploadsInProgress ? 'Importazione' : 'Ultima importazione'}
              title={uploadsInProgress ? 'Importazione in corso' : 'Importazione completata'}
            />
            <View style={styles.uploadList}>
              {uploads.map((item) => (
                <View key={item.id} style={[styles.uploadRow, { backgroundColor: c.card, borderColor: c.border }]}>
                  <AppIcon name={materialIcon(item.kind)} size={16} color={c.primary} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.uploadInfo}>
                      <Text style={[styles.uploadName, { color: c.foreground }]} numberOfLines={1}>{item.name}</Text>
                      <Text style={[styles.progressText, { color: c.primary }]}>{item.progress}%</Text>
                    </View>
                    <View style={[styles.progressTrack, { backgroundColor: c.secondary }]}>
                      <View style={[styles.progressFill, { backgroundColor: c.primary, width: `${item.progress}%` }]} />
                    </View>
                  </View>
                  {item.status === 'completato' ? <AppIcon name="circle-check" size={17} color={c.primary} /> : null}
                  {item.status === 'errore' ? <AppIcon name="warning" size={17} color={c.destructive} /> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <SectionTitle eyebrow="Libreria" title={materials.length ? `${materials.length} materiali` : 'Nessun materiale'} action={materials.length ? `${selectedMaterials.length} selezionati` : undefined} />

        {materials.length ? materials.map((item) => {
          const selected = selectedIds.includes(item.id);
          return (
            <View key={item.id} style={[styles.material, { backgroundColor: c.card, borderColor: selected ? c.primary : c.border }]}>
              <Pressable accessibilityLabel={selected ? `Deseleziona ${item.name}` : `Seleziona ${item.name}`} onPress={() => toggleMaterial(item.id)} style={[styles.selector, { backgroundColor: selected ? c.primary : c.secondary, borderColor: selected ? c.primary : c.border }]}>
                {selected ? <AppIcon name="check" size={11} color={c.primaryForeground} /> : null}
              </Pressable>
              <View style={[styles.fileIcon, { backgroundColor: item.kind === 'video' || item.kind === 'audio' ? c.secondary : c.accent }]}>
                <AppIcon name={materialIcon(item.kind)} size={17} color={item.kind === 'video' || item.kind === 'audio' ? c.foreground : c.accentForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.materialTitle, { color: c.foreground }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.small, { color: c.mutedForeground }]}>
                  {item.kind.toUpperCase()}{item.size ? ` · ${(item.size / 1024 / 1024).toFixed(1)} MB` : ''}
                </Text>
                {(() => {
                  const ready = item.extractionStatus === 'ready';
                  const failed = item.extractionStatus === 'failed';
                  const analyzing = item.extractionStatus === 'pending' || item.extractionStatus === 'processing';
                  const badgeColor = ready ? c.primary : failed ? c.destructive : c.mutedForeground;
                  const badgeLabel = ready
                    ? 'Pronto per lo studio'
                    : item.extractionStatus === 'unsupported'
                    ? 'Solo archivio · contenuto non analizzabile'
                    : failed
                    ? 'Analisi non riuscita'
                    : item.kind === 'audio' || item.kind === 'video'
                    ? 'Trascrizione in corso'
                    : item.kind === 'immagine'
                      ? 'OCR in corso'
                    : 'Analisi in corso';
                  return (
                    <View style={styles.analysisInfo}>
                      <View style={styles.readinessRow}>
                        <AppIcon
                          name={ready ? 'circle-check' : failed ? 'warning' : 'info'}
                          size={12}
                          color={badgeColor}
                        />
                        <Text style={[styles.readinessText, { color: badgeColor }]} numberOfLines={1}>
                          {badgeLabel}
                        </Text>
                      </View>
                      {!ready && !analyzing ? (
                        <Text style={[styles.analysisMessage, { color: c.mutedForeground }]} numberOfLines={2}>
                          {item.extractionMessage}
                        </Text>
                      ) : null}
                      {failed ? (
                        <Pressable accessibilityLabel={`Riprova analisi ${item.name}`} onPress={() => void retryAnalysis(item)} hitSlop={8}>
                          <Text style={[styles.retryText, { color: c.primary }]}>Riprova analisi</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })()}
              </View>
              <Pressable accessibilityLabel={`Elimina ${item.name}`} onPress={() => setModal({ kind: 'elimina', material: item })} hitSlop={10} style={styles.deleteButton}>
                <AppIcon name="trash" size={16} color={c.destructive} />
              </Pressable>
            </View>
          );
        }) : (
          <View style={[styles.empty, { backgroundColor: c.card }]}>
            <AppIcon name="folder" size={22} color={c.primary} />
            <Text style={[styles.emptyTitle, { color: c.foreground }]}>La libreria è vuota</Text>
            <Text style={[styles.small, { color: c.mutedForeground }]}>Tocca “Importa più file insieme” per iniziare.</Text>
          </View>
        )}

        {availableGroups.length ? (
          <View>
            <SectionTitle eyebrow="Gruppi salvati" title="Riprendi un pacchetto" />
            <View style={styles.savedGroups}>
              {availableGroups.slice(0, 4).map((group) => {
                const selected = group.materialIds.length === selectedIds.length
                  && group.materialIds.every((id) => selectedIds.includes(id));
                return (
                  <Pressable
                    key={group.id}
                    testID={`gruppo-${group.id}`}
                    onPress={() => setSelectedIds(group.materialIds)}
                    style={({ pressed }) => [styles.savedGroup, { backgroundColor: selected ? c.accent : c.card, borderColor: selected ? c.primary : c.border, opacity: pressed ? 0.75 : 1 }]}
                  >
                    <View style={[styles.savedGroupIcon, { backgroundColor: selected ? c.primary : c.secondary }]}>
                      <AppIcon name="layers" size={15} color={selected ? c.primaryForeground : c.foreground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.savedGroupTitle, { color: c.foreground }]} numberOfLines={1}>{group.title}</Text>
                      <Text style={[styles.small, { color: c.mutedForeground }]}>{group.materialIds.length} {group.materialIds.length === 1 ? 'materiale' : 'materiali'}</Text>
                    </View>
                    <AppIcon name={selected ? 'check' : 'chevron-right'} size={14} color={selected ? c.primary : c.mutedForeground} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {selectedMaterials.length ? (
          <View style={[styles.groupCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[styles.groupIcon, { backgroundColor: c.accent }]}>
              <AppIcon name="layers" size={18} color={c.accentForeground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.groupLabel, { color: c.primary }]}>TITOLO AUTOMATICO</Text>
              <Text style={[styles.groupTitle, { color: c.foreground }]} numberOfLines={2}>{groupTitle}</Text>
              <Text style={[styles.small, { color: c.mutedForeground }]}>{selectedMaterials.length} file pronti per l’analisi unificata</Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.tip, { backgroundColor: c.card }]}>
          <AppIcon name="lock" size={16} color={c.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.tipTitle, { color: c.foreground }]}>Libreria privata e sincronizzata</Text>
            <Text style={[styles.small, { color: c.mutedForeground }]}>I file sono protetti dal tuo account e disponibili anche sugli altri dispositivi.</Text>
          </View>
        </View>
         <PrimaryButton onPress={askToGenerate} disabled={!selectedMaterials.length || generatingLabs} icon="generate">
           {generatingLabs
             ? 'Generazione laboratori…'
             : selectedMaterials.length
               ? `Prepara ${readySelectedMaterials.length} ${readySelectedMaterials.length === 1 ? 'materiale pronto' : 'materiali pronti'}`
               : 'Seleziona i materiali'}
        </PrimaryButton>
      </ScrollView>

      {modalProps ? (
        <AppModal
          visible
          title={modalProps.title}
          message={modalProps.message}
          icon={modalProps.icon}
          actions={modalProps.actions}
          onDismiss={() => setModal(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.6, marginBottom: 5 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 27, letterSpacing: -0.8 },
  intro: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20, maxWidth: 340 },
  upload: { borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  uploadIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  uploadTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, marginBottom: 4 },
  small: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  uploadList: { gap: 8 },
  uploadRow: { borderWidth: 1, borderRadius: 15, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  uploadInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  progressText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 7 },
  progressFill: { height: '100%', borderRadius: 3 },
  material: { borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  selector: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  fileIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  materialTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginBottom: 4 },
  readinessRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  analysisInfo: { gap: 3 },
  readinessText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 11, lineHeight: 15 },
  analysisMessage: { fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 14, marginTop: 1 },
  retryText: { fontFamily: 'Inter_700Bold', fontSize: 11, marginTop: 2 },
  deleteButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  empty: { borderRadius: 18, padding: 20, gap: 7, alignItems: 'flex-start' },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  savedGroups: { gap: 8 },
  savedGroup: { borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  savedGroupIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  savedGroupTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 3 },
  groupCard: { borderWidth: 1, borderRadius: 19, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  groupLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.1, marginBottom: 4 },
  groupTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, lineHeight: 20, marginBottom: 3 },
  tip: { padding: 16, borderRadius: 18, flexDirection: 'row', gap: 12 },
  tipTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginBottom: 4 },
});