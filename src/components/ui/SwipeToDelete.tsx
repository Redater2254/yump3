import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { PressableScale } from './PressableScale';

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
  label?: string;
}

/** Wraps a row so it can be swiped left to reveal a destructive action. */
export const SwipeToDelete: React.FC<Props> = ({ children, onDelete, label = 'Delete' }) => {
  const renderRightActions = () => (
    <PressableScale
      style={styles.action}
      onPress={onDelete}
      activeScale={0.95}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name="trash-outline" size={20} color="#ffffff" />
      <Text style={styles.actionText}>{label}</Text>
    </PressableScale>
  );

  return (
    <ReanimatedSwipeable
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
      containerStyle={styles.container}
    >
      {children}
    </ReanimatedSwipeable>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 0,
  },
  action: {
    width: 84,
    backgroundColor: '#ff1744',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginLeft: 6,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
});
