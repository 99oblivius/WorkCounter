export const ACTIVITY_TYPES = [
  { name: 'meeting', label: 'Meeting', color: '#ef4444', borderColor: 'border-red-500', bgColor: 'bg-red-500' },
  { name: 'coding', label: 'Coding', color: '#3b82f6', borderColor: 'border-blue-500', bgColor: 'bg-blue-500' },
  { name: 'review', label: 'Review', color: '#eab308', borderColor: 'border-yellow-500', bgColor: 'bg-yellow-500' },
  { name: 'testing', label: 'Testing', color: '#22c55e', borderColor: 'border-green-500', bgColor: 'bg-green-500' },
  { name: 'documentation', label: 'Documentation', color: '#a855f7', borderColor: 'border-purple-500', bgColor: 'bg-purple-500' },
  { name: 'planning', label: 'Planning', color: '#ec4899', borderColor: 'border-pink-500', bgColor: 'bg-pink-500' },
  { name: 'break', label: 'Break', color: '#6b7280', borderColor: 'border-gray-500', bgColor: 'bg-gray-500' },
  { name: 'research', label: 'Research', color: '#f59e0b', borderColor: 'border-orange-500', bgColor: 'bg-orange-500' },
];

export const getActivityTypeColor = (activityType?: string | null) => {
  if (!activityType) return null;
  return ACTIVITY_TYPES.find(t => t.name === activityType);
};
