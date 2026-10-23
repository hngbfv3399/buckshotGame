import type { Item } from './game'

export const itemMeta: Record<Item, { name: string; symbol: string; description: string }> = {
  magnifier: { name: '돋보기', symbol: '◉', description: '현재 탄환 확인' },
  beer: { name: '맥주', symbol: '⌁', description: '현재 탄환 배출' },
  saw: { name: '톱', symbol: '╱', description: '다음 실탄 피해 +1' },
  cigarette: { name: '담배', symbol: '✚', description: '체력 1 회복' },
  handcuffs: { name: '수갑', symbol: '⛓', description: '상대의 다음 턴 건너뜀' },
  phone: { name: '버너폰', symbol: '▣', description: '미래 탄환 하나 확인' },
  inverter: { name: '인버터', symbol: '⇄', description: '현재 탄환 반전' },
  medicine: { name: '유통기한 약', symbol: '✥', description: '50% 확률로 체력 +2 또는 -1' },
  adrenaline: { name: '아드레날린', symbol: '↯', description: '상대 아이템 즉시 사용' },
  jammer: { name: '전파 방해 장치', symbol: '◈', description: '상대의 다음 턴 건너뜀' },
}
