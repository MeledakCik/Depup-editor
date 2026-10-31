export type MotionEnter = 'left' | 'right' | 'top' | 'bottom' | 'scale';
export type MotionPosition = 'lower-left' | 'lower-center' | 'lower-right' | 'center' | 'top-center';
export type MotionPreset = {
  id: string;
  name: string;
  description: string;
  title: string;
  subtitle: string;
  fill: string;
  accent: string;
  text: string;
  width: number;
  height: number;
  enter: MotionEnter;
  position: MotionPosition;
  duration: number;
};

export const MOTION_PRESETS: MotionPreset[] = [
  { id: 'title-reveal', name: 'Title Reveal', description: 'Judul besar masuk dari kiri', title: 'CERITA BARU', subtitle: 'SEBUAH AWAL YANG BERBEDA', fill: 'rgba(12,18,32,0.88)', accent: '#31d6c3', text: '#ffffff', width: 640, height: 150, enter: 'left', position: 'lower-left', duration: 120 },
  { id: 'lower-third', name: 'Lower Third', description: 'Nama dan keterangan', title: 'NAMA PEMBICARA', subtitle: 'Jabatan · Lokasi', fill: 'rgba(12,18,32,0.94)', accent: '#4f7cff', text: '#ffffff', width: 560, height: 116, enter: 'left', position: 'lower-left', duration: 144 },
  { id: 'subscribe', name: 'Subscribe', description: 'Call to action berwarna', title: 'SUBSCRIBE', subtitle: 'LIKE  ·  SHARE  ·  FOLLOW', fill: '#e7334d', accent: '#ffffff', text: '#ffffff', width: 410, height: 126, enter: 'scale', position: 'lower-center', duration: 96 },
  { id: 'callout', name: 'Callout', description: 'Sorot poin penting', title: 'POIN PENTING', subtitle: 'Jangan lewatkan detail ini', fill: '#f2c94c', accent: '#171717', text: '#171717', width: 500, height: 126, enter: 'right', position: 'lower-right', duration: 120 },
  { id: 'end-card', name: 'End Card', description: 'Penutup video dua baris', title: 'TERIMA KASIH', subtitle: 'Sampai jumpa di video berikutnya', fill: 'rgba(20,24,38,0.96)', accent: '#ff8a4c', text: '#ffffff', width: 610, height: 190, enter: 'bottom', position: 'center', duration: 144 },
];
