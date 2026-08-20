"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { ServiceCategory } from "@/lib/types";

/**
 * The kiosk speaks two languages, chosen by the customer standing at it.
 *
 * This is deliberately NOT a general i18n framework. The kiosk is the one
 * surface where the reader is a member of the public who did not choose this
 * app, so it earns a real language toggle; the staff surfaces have their own
 * (bilingual side-by-side) conventions and are not routed through here.
 *
 * The dictionary is one typed object per language. `KioskStrings` is the
 * contract: add a key and the compiler makes you add it in both languages —
 * a missing translation is a build error, not a blank screen in a lobby.
 *
 * The choice resets with the flow's per-customer reset: the next customer
 * starts in English, because a tablet stuck in the previous customer's
 * language is a tablet somebody walks away from.
 */

export type KioskLang = "en" | "vi";

type KioskStrings = {
  /* shell */
  offline: string;
  managerPin: string;
  leavesKiosk: string;
  cancel: string;
  exitKiosk: string;
  checking: string;
  lockedOut: string;
  noPinSet: string;
  wrongPin: string;

  /* idle + flow chrome */
  welcomeTo: (salon: string) => string;
  tapToCheckIn: string;
  stillThere: string;
  startingOverIn: string;
  imStillHere: string;
  back: string;

  /* keypad */
  whatsYourNumber: string;
  didntFindIt: string;
  delete: string;

  /* confirm */
  with: (tech: string) => string;
  checkIn: string;
  checkingYouIn: string;
  allSetTakeASeat: string;
  visitFinished: string;
  tooEarly: (minutes: number) => string;
  appointmentPassed: string;
  notYou: string;

  /* success */
  youreCheckedIn: string;
  willBeWithYou: (tech: string) => string;
  youreNext: string;
  aheadOfYou: (n: number) => string;
  takeASeat: string;

  /* problems */
  tooManyTries: string;
  alreadyCheckedIn: string;
  notQuiteTime: string;
  seeFrontDesk: string;

  /* booking: services */
  whatAreYouHaving: string;
  selectedSummary: (n: number, minutes: number) => string;
  chooseAtLeastOne: string;
  continue_: string;
  minutesShort: (minutes: number) => string;
  replaces: (name: string) => string;
  category: Record<ServiceCategory, string>;

  /* booking: tech */
  whoWouldYouLike: string;
  availableNow: (n: number) => string;
  checkingWhosFree: string;
  nobodyToday: string;
  nobodyTodayBody: string;
  firstAvailable: string;
  fromTime: (time: string) => string;
  openings: (n: number) => string;

  /* booking: time */
  whenSuitsYou: string;
  timeTaken: string;
  findingTimes: string;
  noTimesLeft: string;
  noTimesLeftBody: string;
  booking: string;

  /* booked */
  youreBooked: string;
  aboutMinutes: (minutes: number) => string;
  bookingsBefore: (n: number) => string;
  takeYourTime: string;
  clearingIn: (s: number) => string;
  giveMeAMinute: string;
  done: string;

  /* register */
  firstTimeHere: string;
  justAFewThings: string;
  firstName: string;
  lastName: string;
  language: string;
  avoidLabel: string;
  avoidHint: string;
  saving: string;
};

const EN: KioskStrings = {
  offline: "No connection — checking in will retry automatically.",
  managerPin: "Manager PIN",
  leavesKiosk: "Leaves kiosk mode on this tablet.",
  cancel: "Cancel",
  exitKiosk: "Exit kiosk",
  checking: "Checking…",
  lockedOut: "Too many tries. Try again in a few minutes.",
  noPinSet: "No manager PIN has been set for this salon.",
  wrongPin: "That PIN didn't match.",

  welcomeTo: (salon) => `Welcome to ${salon}`,
  tapToCheckIn: "Tap to check in",
  stillThere: "Still there?",
  startingOverIn: "Starting over in",
  imStillHere: "I'm still here",
  back: "Back",

  whatsYourNumber: "What's your phone number?",
  didntFindIt: "We didn't find that one. Give it another go.",
  delete: "Delete",

  with: (tech) => `with ${tech}`,
  checkIn: "Check in",
  checkingYouIn: "Checking you in…",
  allSetTakeASeat: "You're all set — please take a seat.",
  visitFinished: "That visit is already finished.",
  tooEarly: (minutes) => `Please check in within ${minutes} minutes of your appointment.`,
  appointmentPassed: "That appointment has passed — please see the front desk.",
  notYou: "Not you? Start over",

  youreCheckedIn: "You're checked in",
  willBeWithYou: (tech) => `${tech} will be with you`,
  youreNext: "You're next.",
  aheadOfYou: (n) => `${n} ${n === 1 ? "person is" : "people are"} ahead of you.`,
  takeASeat: "Please take a seat",

  tooManyTries: "Too many tries just now. Please see the front desk.",
  alreadyCheckedIn: "You're already checked in — please take a seat.",
  notQuiteTime: "It's not quite time yet. Please see the front desk.",
  seeFrontDesk: "Please see the front desk.",

  whatAreYouHaving: "What are you having?",
  selectedSummary: (n, minutes) => `${n} selected · about ${minutes} min`,
  chooseAtLeastOne: "Choose at least one",
  continue_: "Continue",
  minutesShort: (minutes) => `${minutes} min`,
  replaces: (name) => ` · replaces ${name}`,
  category: {
    manicure: "Manicures",
    pedicure: "Pedicures",
    enhancement: "Enhancements",
    wax: "Waxing",
    addon: "Add-ons",
  },

  whoWouldYouLike: "Who would you like?",
  availableNow: (n) => `${n} available now`,
  checkingWhosFree: "Checking who's free…",
  nobodyToday: "Nobody can take that today",
  nobodyTodayBody: "Try fewer services, or see the front desk and they'll sort something out.",
  firstAvailable: "First available",
  fromTime: (time) => `from ${time}`,
  openings: (n) => `${n} ${n === 1 ? "opening" : "openings"}`,

  whenSuitsYou: "When suits you?",
  timeTaken: "That time just got taken. Here's what's left.",
  findingTimes: "Finding times…",
  noTimesLeft: "No times left today",
  noTimesLeftBody: "Please see the front desk — they can look at tomorrow.",
  booking: "Booking…",

  youreBooked: "You're booked",
  aboutMinutes: (minutes) => `about ${minutes} min`,
  bookingsBefore: (n) => ` · ${n} ${n === 1 ? "booking" : "bookings"} before yours`,
  takeYourTime: "Take your time — tap when you're done.",
  clearingIn: (s) => `Clearing in ${s}…`,
  giveMeAMinute: "Give me a minute",
  done: "Done",

  firstTimeHere: "First time here?",
  justAFewThings: "Just a few things and you're set.",
  firstName: "First name",
  lastName: "Last name",
  language: "Language",
  avoidLabel: "Anything we should avoid?",
  avoidHint: "Allergies or sensitivities. Leave blank if none.",
  saving: "Saving…",
};

const VI: KioskStrings = {
  offline: "Mất kết nối — máy sẽ tự thử lại.",
  managerPin: "Mã PIN quản lý",
  leavesKiosk: "Thoát chế độ kiosk trên máy này.",
  cancel: "Hủy",
  exitKiosk: "Thoát kiosk",
  checking: "Đang kiểm tra…",
  lockedOut: "Nhập sai quá nhiều lần. Vui lòng thử lại sau vài phút.",
  noPinSet: "Tiệm chưa cài mã PIN quản lý.",
  wrongPin: "Mã PIN không đúng.",

  welcomeTo: (salon) => `Chào mừng đến ${salon}`,
  tapToCheckIn: "Chạm để nhận chỗ",
  stillThere: "Bạn còn đó không?",
  startingOverIn: "Bắt đầu lại sau",
  imStillHere: "Tôi vẫn ở đây",
  back: "Quay lại",

  whatsYourNumber: "Số điện thoại của bạn?",
  didntFindIt: "Không tìm thấy số này. Vui lòng thử lại.",
  delete: "Xóa",

  with: (tech) => `với ${tech}`,
  checkIn: "Nhận chỗ",
  checkingYouIn: "Đang ghi nhận…",
  allSetTakeASeat: "Xong rồi — mời bạn ngồi chờ.",
  visitFinished: "Lượt này đã hoàn tất.",
  tooEarly: (minutes) => `Vui lòng nhận chỗ trong vòng ${minutes} phút trước giờ hẹn.`,
  appointmentPassed: "Giờ hẹn đã qua — vui lòng gặp quầy lễ tân.",
  notYou: "Không phải bạn? Bắt đầu lại",

  youreCheckedIn: "Bạn đã nhận chỗ",
  willBeWithYou: (tech) => `${tech} sẽ phục vụ bạn`,
  youreNext: "Bạn là người tiếp theo.",
  aheadOfYou: (n) => `Còn ${n} khách trước bạn.`,
  takeASeat: "Mời bạn ngồi chờ",

  tooManyTries: "Thử quá nhiều lần. Vui lòng gặp quầy lễ tân.",
  alreadyCheckedIn: "Bạn đã nhận chỗ rồi — mời ngồi chờ.",
  notQuiteTime: "Chưa tới giờ. Vui lòng gặp quầy lễ tân.",
  seeFrontDesk: "Vui lòng gặp quầy lễ tân.",

  whatAreYouHaving: "Bạn muốn làm gì hôm nay?",
  selectedSummary: (n, minutes) => `Đã chọn ${n} · khoảng ${minutes} phút`,
  chooseAtLeastOne: "Chọn ít nhất một dịch vụ",
  continue_: "Tiếp tục",
  minutesShort: (minutes) => `${minutes} phút`,
  replaces: (name) => ` · thay cho ${name}`,
  category: {
    manicure: "Làm móng tay",
    pedicure: "Làm móng chân",
    enhancement: "Móng đắp / úp",
    wax: "Wax lông",
    addon: "Dịch vụ thêm",
  },

  whoWouldYouLike: "Bạn muốn thợ nào?",
  availableNow: (n) => `${n} thợ đang rảnh`,
  checkingWhosFree: "Đang xem ai rảnh…",
  nobodyToday: "Hôm nay không ai nhận được",
  nobodyTodayBody: "Thử bớt dịch vụ, hoặc gặp quầy lễ tân để được sắp xếp.",
  firstAvailable: "Thợ nào rảnh trước",
  fromTime: (time) => `từ ${time}`,
  openings: (n) => `${n} chỗ trống`,

  whenSuitsYou: "Mấy giờ tiện cho bạn?",
  timeTaken: "Giờ đó vừa có người lấy. Đây là các giờ còn lại.",
  findingTimes: "Đang tìm giờ trống…",
  noTimesLeft: "Hôm nay hết giờ trống",
  noTimesLeftBody: "Vui lòng gặp quầy lễ tân — họ có thể xếp cho ngày mai.",
  booking: "Đang đặt…",

  youreBooked: "Đã đặt xong",
  aboutMinutes: (minutes) => `khoảng ${minutes} phút`,
  bookingsBefore: (n) => ` · còn ${n} lượt trước bạn`,
  takeYourTime: "Cứ từ từ — chạm khi bạn xong.",
  clearingIn: (s) => `Tự đóng sau ${s} giây…`,
  giveMeAMinute: "Cho tôi một phút",
  done: "Xong",

  firstTimeHere: "Lần đầu đến tiệm?",
  justAFewThings: "Chỉ vài thông tin là xong.",
  firstName: "Tên",
  lastName: "Họ",
  language: "Ngôn ngữ",
  avoidLabel: "Có gì cần tránh không?",
  avoidHint: "Dị ứng hoặc da nhạy cảm. Bỏ trống nếu không có.",
  saving: "Đang lưu…",
};

const DICTIONARIES: Record<KioskLang, KioskStrings> = { en: EN, vi: VI };

type KioskLangContextValue = {
  lang: KioskLang;
  t: KioskStrings;
  setLang: (lang: KioskLang) => void;
  /** Back to English — called by the flow's per-customer reset. */
  resetLang: () => void;
};

const KioskLangContext = createContext<KioskLangContextValue | null>(null);

export function KioskLangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<KioskLang>("en");
  const resetLang = useCallback(() => setLang("en"), []);
  const value = useMemo(
    () => ({ lang, t: DICTIONARIES[lang], setLang, resetLang }),
    [lang, resetLang],
  );
  return <KioskLangContext.Provider value={value}>{children}</KioskLangContext.Provider>;
}

export function useKioskText(): KioskLangContextValue {
  const value = useContext(KioskLangContext);
  if (!value) throw new Error("useKioskText must be used inside <KioskLangProvider>");
  return value;
}
