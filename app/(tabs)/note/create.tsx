import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { NoteImageGallery } from '@/components/NoteImageGallery';
import { useStorage } from '@/contexts/StorageContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { compressImageFromFile, validateImageBase64, formatFileSize } from '@/utils/imageCompression';
import { useCallback } from 'react';

export default function CreateNoteScreen() {
  const { strings } = useLanguage();
  const { theme } = useTheme();
  const { createNote, notes } = useStorage();
  const { preserveData } = useLocalSearchParams<{ preserveData?: string }>();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ content?: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shouldReset, setShouldReset] = useState(true);

  // Réinitialiser le formulaire au focus de la page
  useFocusEffect(
    useCallback(() => {
      console.log('📝 Page de création de note focalisée - shouldReset:', shouldReset);
      
      // Réinitialiser le formulaire si nécessaire
      if (shouldReset) {
        console.log('🔄 Réinitialisation du formulaire');
        setTitle('');
        setDescription('');
        setLocation('');
        setTags('');
        setContent('');
        setImages([]);
        setErrors({});
        setLoading(false);
        setShouldReset(false);
      }
    }, [shouldReset])
  );

  const handleBack = () => {
    safeNavigate('/(tabs)/notes');
  };

  const safeNavigate = (path: string) => {
    try {
      if (router.canGoBack !== undefined) {
        router.push(path);
      } else {
        setTimeout(() => {
          router.push(path);
        }, 100);
      }
    } catch (error) {
      console.error('Erreur de navigation:', error);
      setTimeout(() => {
        try {
          router.push(path);
        } catch (retryError) {
          console.error('Erreur de navigation retry:', retryError);
        }
      }, 200);
    }
  };

  const validateForm = () => {
    // Aucune validation obligatoire - les notes peuvent être créées vides
    setErrors({});
    return true;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;
    
    console.log('🚀 Début création note avec:', {
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      tags: tags.trim(),
      content: content.trim(),
      imagesCount: images.length
    });

    setLoading(true);
    try {
      // Générer un titre automatique si aucun titre n'est fourni
      let finalTitle = title.trim();
      if (!finalTitle) {
        const existingTitles = notes.map(n => n.title).filter(t => t.startsWith('Note sans titre'));
        const nextNumber = existingTitles.length + 1;
        finalTitle = `Note sans titre ${nextNumber}`;
      }
      
      // CORRECTION: Validation plus robuste des images pour la création
      const validImages = images.filter(img => validateImageBase64(img));
      
      console.log(`📸 Images validées pour création: ${validImages.length}/${images.length}`);
      
      const noteData = {
        title: finalTitle,
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        tags: tags.trim() || undefined,
        content: content.trim() || '', // Permettre un contenu vide
        images: validImages, // CORRECTION : Toujours passer le tableau, même vide
      };
      
      console.log('📋 Données de la note à créer:', {
        ...noteData,
        images: `${noteData.images?.length || 0} images`
      });
      
      // Créer la note
      const note = await createNote(noteData);

      if (note) {
        console.log('✅ Note créée avec succès:', note.id);
        console.log('✅ Images dans la note créée:', note.images?.length || 0);
        
        // Marquer qu'il faut réinitialiser le formulaire au prochain focus
        setShouldReset(true);
        safeNavigate(`/(tabs)/note/${note.id}`);
      } else {
        console.error('❌ createNote a retourné null - problème dans StorageContext');
        Alert.alert('Erreur', 'Impossible de créer la note. Veuillez réessayer.');
        setShouldReset(true);
        safeNavigate('/(tabs)/notes');
      }
    } catch (error) {
      console.error('❌ Erreur lors de la création de la note:', error);
      Alert.alert('Erreur', 'Impossible de créer la note. Veuillez réessayer.');
      setShouldReset(true);
      safeNavigate('/(tabs)/notes');
    } finally {
      setLoading(false);
    }
  };

  const processImage = async (file: File): Promise<string> => {
    console.log('📸 Traitement image création avec compression:', file.name, formatFileSize(file.size));
    
    // Vérification de la taille avant traitement
    const maxSize = 50 * 1024 * 1024; // 50MB max par image (augmenté pour permettre la compression)
    if (file.size > maxSize) {
      throw new Error(`Image trop volumineuse: ${formatFileSize(file.size)} > ${formatFileSize(maxSize)}`);
    }
    
    try {
      // Compresser l'image avec des paramètres optimisés
      const compressionResult = await compressImageFromFile(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.85, // Qualité élevée pour garder la lisibilité
        format: 'jpeg'
      });
      
      console.log('✅ Image création compressée avec succès:');
      console.log(`   Taille originale: ${formatFileSize(compressionResult.originalSize)}`);
      console.log(`   Taille compressée: ${formatFileSize(compressionResult.compressedSize)}`);
      console.log(`   Compression: ${compressionResult.compressionRatio.toFixed(1)}%`);
      
      return compressionResult.compressedBase64;
    } catch (error) {
      console.error('❌ Erreur compression image création:', error);
      throw new Error('Impossible de traiter l\'image');
    }
  };

  const handleAddImage = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleFileSelect = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const files = target.files;
    
    if (files && files.length > 0) {
      // CORRECTION : Vérifications plus permissives pour éviter les blocages
      const totalSize = Array.from(files).reduce((sum, file) => sum + file.size, 0);
      const totalSizeMB = totalSize / 1024 / 1024;
      const newTotalImages = images.length + files.length;
      
      if (totalSizeMB > 100) { // Augmenté de 50MB à 100MB
        console.warn('⚠️ Taille totale trop importante:', totalSizeMB.toFixed(2), 'MB');
        Alert.alert(
          'Images trop volumineuses',
          `La taille totale des images (${totalSizeMB.toFixed(1)}MB) dépasse la limite de 100MB.`,
          [{ text: 'OK' }]
        );
        target.value = '';
        return;
      }
      
      if (newTotalImages > 50) { // Augmenté de 20 à 50 images max
        console.warn('⚠️ Limite d\'images atteinte (50 max)');
        Alert.alert(
          'Limite d\'images atteinte',
          'Vous ne pouvez pas ajouter plus de 50 images par note.',
          [{ text: 'OK' }]
        );
        target.value = '';
        return;
      }
      
      try {
        console.log('📸 Images sélectionnées:', files.length);
        
        // CORRECTION : Traitement par lots pour éviter les timeouts
        const processedImages: string[] = [];
        const batchSize = 3; // Traiter 3 images à la fois
        
        for (let i = 0; i < files.length; i += batchSize) {
          const batch = Array.from(files).slice(i, i + batchSize);
          console.log(`📸 Traitement batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(files.length/batchSize)}`);
          
          const batchPromises = batch.map(async (file, batchIndex) => {
            const globalIndex = i + batchIndex;
            
            if (!file || !file.type.startsWith('image/')) {
              console.warn(`⚠️ Fichier ${globalIndex} ignoré (pas une image):`, file?.type);
              return null;
            }
            
            try {
              console.log(`📸 Traitement image ${globalIndex + 1}/${files.length}:`, file.name);
              const compressedImage = await processImage(file);
              
              if (compressedImage && compressedImage.length > 50) {
                console.log(`✅ Image ${globalIndex + 1} traitée avec succès`);
                return compressedImage;
              } else {
                console.error(`❌ Image ${globalIndex + 1} invalide après traitement`);
                return null;
              }
            } catch (error) {
              console.error(`❌ Erreur traitement image ${globalIndex + 1}:`, error);
              return null;
            }
          });
          
          const batchResults = await Promise.all(batchPromises);
          const validBatchImages = batchResults.filter(img => img !== null) as string[];
          processedImages.push(...validBatchImages);
          
          // Pause entre les batches pour éviter de bloquer l'UI
          if (i + batchSize < files.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
        // Ajouter toutes les images traitées avec succès
        if (processedImages.length > 0) {
          setImages(prev => [...prev, ...processedImages]);
          console.log(`✅ ${processedImages.length}/${files.length} images ajoutées avec succès`);
          
          if (processedImages.length < files.length) {
            Alert.alert(
              'Information',
              `${processedImages.length} image(s) sur ${files.length} ont été ajoutées avec succès.`,
              [{ text: 'OK' }]
            );
          }
        } else {
          console.warn('⚠️ Aucune image n\'a pu être traitée');
          Alert.alert('Erreur', 'Aucune image n\'a pu être traitée. Vérifiez le format des fichiers.');
        }
        
      } catch (error) {
        console.error('❌ Erreur générale lors du traitement des images:', error);
        Alert.alert('Erreur', 'Erreur lors du traitement des images.');
      }
    }
    
    // Réinitialiser l'input
    target.value = '';
  };


  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <Header
        title={strings.newNote}
        onBack={handleBack}
      />
      
      <KeyboardAvoidingView 
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          style={styles.content} 
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Input
            label={strings.noteTitle}
            value={title}
            onChangeText={setTitle}
          />

          <Input
            label={strings.description}
            value={description}
            onChangeText={setDescription}
          />

          <Input
            label="Lieu"
            value={location}
            onChangeText={setLocation}
          />

          <Input
            label="Mots-clés"
            value={tags}
            onChangeText={setTags}
          />

          <NoteImageGallery 
            images={images}
            onRemoveImage={handleRemoveImage}
            editable={true}
            disableViewer={true}
          />

          <View style={styles.imageButtonContainer}>
            <TouchableOpacity
              style={styles.addPhotoButton}
              onPress={handleAddImage}
            >
              <Camera size={16} color={theme.colors.primary} />
              <Text style={styles.addPhotoText}>Ajouter une photo</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.contentLabel}>{strings.noteContent}</Text>
          <TextInput
            style={styles.contentTextInput}
            value={content}
            onChangeText={setContent}
            placeholder={strings.writeYourNote}
            placeholderTextColor={theme.colors.textTertiary}
            multiline={true}
            textAlignVertical="top"
            scrollEnabled={true}
            autoCorrect={true}
            spellCheck={true}
            returnKeyType="default"
            blurOnSubmit={false}
          />

          {Platform.OS === 'web' && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleFileSelect(e as any)}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.fixedFooter}>
        <Button
          title={loading ? "Création..." : strings.createNote}
          onPress={handleCreate}
          disabled={loading}
          style={styles.footerButton}
        />
      </View>

    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 140, // Espace augmenté pour le bouton fixe
  },
  imageButtonContainer: {
    marginTop: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: 36,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  addPhotoText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: theme.colors.primary,
  },
  contentLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
    marginBottom: 12,
    marginTop: 16,
  },
  contentTextInput: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: theme.colors.text,
    lineHeight: 24,
    minHeight: 200,
    padding: 0,
    margin: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' && {
      outlineWidth: 0,
      resize: 'none',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  fixedFooter: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    bottom: Platform.OS === 'web' ? 20 : 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  footerButton: {
    width: '100%',
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: theme.colors.error,
    marginTop: 8,
  },
});