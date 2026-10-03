import React from 'react';
import { StyleSheet, Text, View, Modal } from 'react-native';
import { palette } from '../theme';
import { useAlert } from '../context/AlertContext';
import { PressableScale } from './ui/PressableScale';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';

export const CustomAlert: React.FC = () => {
  const { alertConfig, hideAlert } = useAlert();

  if (!alertConfig) return null;

  const { title, message, buttons } = alertConfig;

  // If no buttons specified, default to a single "OK" button
  const alertButtons = buttons && buttons.length > 0 
    ? buttons 
    : [{ text: 'OK', onPress: () => {} }];

  const handleButtonPress = (onPress?: () => void) => {
    hideAlert();
    if (onPress) {
      onPress();
    }
  };

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="none"
      onRequestClose={hideAlert}
    >
      <Animated.View 
        entering={FadeIn.duration(140)} 
        exiting={FadeOut.duration(120)}
        style={styles.overlay}
      >
        <Animated.View 
          entering={ZoomIn.duration(160).springify()} 
          exiting={ZoomOut.duration(120)}
          style={styles.alertCard}
        >
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          
          <View style={[
            styles.buttonRow, 
            alertButtons.length > 2 ? styles.buttonColumn : null
          ]}>
            {alertButtons.map((btn, index) => {
              let btnStyle = styles.defaultBtn;
              let txtStyle = styles.defaultBtnText;

              if (btn.style === 'cancel') {
                btnStyle = styles.cancelBtn;
                txtStyle = styles.cancelBtnText;
              } else if (btn.style === 'destructive') {
                btnStyle = styles.destructiveBtn;
                txtStyle = styles.destructiveBtnText;
              }

              return (
                <PressableScale
                  key={index}
                  style={[styles.button, btn.style === 'cancel' ? styles.buttonCancelOverride : styles.buttonNormal, btnStyle]}
                  onPress={() => handleButtonPress(btn.onPress)}
                  activeScale={0.96}
                >
                  <Text style={[styles.btnText, txtStyle]}>{btn.text}</Text>
                </PressableScale>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertCard: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: palette.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    color: palette.textMuted,
    lineHeight: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  buttonColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonNormal: {
    flex: 1,
  },
  buttonCancelOverride: {
    flex: 1,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  defaultBtn: {
    backgroundColor: palette.accent,
  },
  defaultBtnText: {
    color: palette.accentInk,
  },
  cancelBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: palette.borderStrong,
  },
  cancelBtnText: {
    color: palette.textMuted,
  },
  destructiveBtn: {
    backgroundColor: palette.danger,
  },
  destructiveBtnText: {
    color: palette.text,
  },
});
