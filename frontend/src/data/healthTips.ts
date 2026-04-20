export interface HealthTip {
  id: string;
  category: 'posture' | 'eyes' | 'movement' | 'hydration';
  text: string;
}

export const HEALTH_TIPS: HealthTip[] = [
  {
    id: 'posture-1',
    category: 'posture',
    text: 'Keep your ears aligned over your shoulders and avoid letting your head drift forward toward the screen.',
  },
  {
    id: 'posture-2',
    category: 'posture',
    text: 'Plant your feet flat on the floor and keep your hips slightly higher than your knees.',
  },
  {
    id: 'eyes-1',
    category: 'eyes',
    text: 'Follow the 20-20-20 rule: every 20 minutes, look at something 20 feet away for at least 20 seconds.',
  },
  {
    id: 'eyes-2',
    category: 'eyes',
    text: 'Blink consciously a few times to prevent dry eyes during long work sessions.',
  },
  {
    id: 'movement-1',
    category: 'movement',
    text: 'Stand up, roll your shoulders back and down, and take 10 slow breaths.',
  },
  {
    id: 'movement-2',
    category: 'movement',
    text: 'Do a gentle neck stretch: slowly tilt your head toward each shoulder and hold for 10–15 seconds.',
  },
  {
    id: 'hydration-1',
    category: 'hydration',
    text: 'Take a sip of water and keep a bottle within reach to stay hydrated.',
  },
];

