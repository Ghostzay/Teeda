/**
 * Get Started content.
 *
 * Data rather than markup so the guide stays navigable and every screen is
 * documented to the same shape — what it's for, how to add/edit/delete, what
 * the badges mean, and the mistakes people actually make.
 *
 * Bilingual EN/VI throughout: the floor reads Vietnamese, the reports are
 * usually read in English.
 */

export type Bi = { en: string; vi: string };

export type GuideStep = { action: Bi };

export type GuideBadge = { label: Bi; meaning: Bi; tone: "waiting" | "progress" | "completed" | "muted" };

export type GuideSection = {
  id: string;
  href: string;
  title: Bi;
  purpose: Bi;
  add?: { intro: Bi; steps: GuideStep[] };
  edit?: Bi;
  remove?: Bi;
  badges?: GuideBadge[];
  gotchas: Bi[];
};

export const GUIDE_INTRO: Bi = {
  en: "Every screen in Zolvora, in plain language. Pick a section — you don't need to read it in order.",
  vi: "Hướng dẫn từng màn hình trong Zolvora, viết dễ hiểu. Chọn mục bất kỳ — không cần đọc theo thứ tự.",
};

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "dashboard",
    href: "/dashboard",
    title: { en: "Dashboard — at a glance", vi: "Trang chính — tổng quan" },
    purpose: {
      en: "The one screen to glance at during a busy shift. It shows who is up next in the rotation, who is waiting, who is being served, and what has been taken today. It is read-only — you act from the other screens.",
      vi: "Màn hình để liếc nhanh khi tiệm đông. Hiển thị thợ nào tới lượt, khách đang chờ, khách đang làm, và tiền thu hôm nay. Màn hình này chỉ để xem — thao tác ở các trang khác.",
    },
    gotchas: [
      {
        en: "“Up next” only counts techs who checked in today. If someone is missing from the rotation, they have not tapped Check in for turns.",
        vi: "“Tới lượt” chỉ tính thợ đã điểm danh hôm nay. Nếu thiếu ai, nghĩa là họ chưa bấm Điểm danh nhận lượt.",
      },
      {
        en: "The money line is today only. Use Reports for the week or the pay period.",
        vi: "Dòng tiền chỉ tính hôm nay. Xem theo tuần hoặc kỳ lương ở trang Thu nhập & Báo cáo.",
      },
    ],
  },
  {
    id: "queue",
    href: "/dashboard",
    title: { en: "Dashboard", vi: "Trang chính" },
    purpose: {
      en: "The rotation board and the live floor. It decides which tech gets the next walk-in, in a fair order everyone can see.",
      vi: "Bảng xoay lượt và tình trạng sàn. Quyết định thợ nào nhận khách vãng lai tiếp theo, theo thứ tự công bằng ai cũng thấy được.",
    },
    add: {
      intro: {
        en: "You don't add to the queue here — clients arrive from Check-in or Appointments. What you do here is manage the order.",
        vi: "Bạn không thêm khách ở đây — khách đến từ trang Nhận khách hoặc Lịch hẹn. Ở đây bạn quản lý thứ tự.",
      },
      steps: [
        {
          action: {
            en: "Tap Check in next to a tech's name to put them on today's rotation.",
            vi: "Bấm Điểm danh bên cạnh tên thợ để đưa họ vào lượt hôm nay.",
          },
        },
        {
          action: {
            en: "Tap Send to back to move a tech to the end of the order.",
            vi: "Bấm Xuống cuối để chuyển thợ xuống cuối hàng.",
          },
        },
        {
          action: {
            en: "On a waiting client, tap Give to next in rotation to assign automatically, or pick a name from the dropdown to override.",
            vi: "Với khách đang chờ, bấm Giao cho thợ tới lượt để tự động chia, hoặc chọn tên trong danh sách để chỉ định.",
          },
        },
      ],
    },
    edit: {
      en: "Change who a waiting client is assigned to using the tech dropdown on their card.",
      vi: "Đổi thợ cho khách đang chờ bằng ô chọn thợ trên thẻ khách.",
    },
    remove: {
      en: "Tap Cancel on a client's card to take them off the floor.",
      vi: "Bấm Hủy trên thẻ khách để bỏ khách khỏi danh sách.",
    },
    badges: [
      { label: { en: "Up next", vi: "Tới lượt" }, meaning: { en: "This tech takes the next walk-in.", vi: "Thợ này nhận khách vãng lai kế tiếp." }, tone: "waiting" },
      { label: { en: "With a client", vi: "Đang có khách" }, meaning: { en: "Mid-service, so not eligible for a new client.", vi: "Đang làm khách, nên chưa nhận khách mới." }, tone: "progress" },
      { label: { en: "Booked — off rotation", vi: "Có hẹn — ngoài lượt" }, meaning: { en: "They have an appointment right now, so walk-ins skip them until it ends.", vi: "Đang trong giờ hẹn, nên khách vãng lai bỏ qua họ cho tới khi xong." }, tone: "muted" },
      { label: { en: "Not checked in", vi: "Chưa điểm danh" }, meaning: { en: "On the roster but not on today's rotation.", vi: "Có trong danh sách nhưng chưa vào lượt hôm nay." }, tone: "muted" },
    ],
    gotchas: [
      {
        en: "A tech with no services set can only be given work that needs no particular skill. Set their services on Team.",
        vi: "Thợ chưa chọn dịch vụ chỉ nhận được việc không đòi hỏi kỹ năng riêng. Chọn dịch vụ cho họ ở trang Nhân viên.",
      },
      {
        en: "Passing a client is not free — the tech moves to the back of the rotation. That is deliberate.",
        vi: "Bỏ lượt không miễn phí — thợ sẽ bị chuyển xuống cuối hàng. Đây là cố ý.",
      },
    ],
  },
  {
    id: "schedule",
    href: "/schedule",
    title: { en: "Staff hours", vi: "Giờ làm của thợ" },
    purpose: {
      en: "The hour-by-hour plan. Shifts (when a tech is working) sit underneath appointments and walk-ins, so you can see at a glance who is free.",
      vi: "Kế hoạch theo giờ. Ca làm (giờ thợ đi làm) nằm dưới lịch hẹn và khách vãng lai, để bạn thấy ngay ai đang rảnh.",
    },
    add: {
      intro: {
        en: "Shifts are the only thing you create here. Appointments and walk-ins appear on their own.",
        vi: "Ở đây bạn chỉ tạo ca làm. Lịch hẹn và khách vãng lai tự hiện lên.",
      },
      steps: [
        { action: { en: "Pick the day from the date strip along the top.", vi: "Chọn ngày ở dải ngày phía trên." } },
        { action: { en: "Tap any empty slot in a tech's column.", vi: "Chạm vào ô trống trong cột của thợ." } },
        { action: { en: "Set From and To, choose Working, Break or Time off, then tap Add shift.", vi: "Chọn giờ Từ và Đến, chọn Đang làm / Nghỉ giải lao / Nghỉ phép, rồi bấm Thêm ca làm." } },
      ],
    },
    edit: {
      en: "Tap the shift block itself, change the times, and tap Save changes.",
      vi: "Chạm vào khối ca làm, sửa giờ, rồi bấm Lưu thay đổi.",
    },
    remove: {
      en: "Tap the shift, then tap Delete shift at the bottom of the panel.",
      vi: "Chạm vào ca làm, rồi bấm Xóa ca làm ở cuối bảng.",
    },
    badges: [
      { label: { en: "Shift", vi: "Ca làm" }, meaning: { en: "Solid fill. Hours the tech is available. You can edit these.", vi: "Nền đặc. Giờ thợ có mặt. Bạn sửa được." }, tone: "muted" },
      { label: { en: "Appointment", vi: "Lịch hẹn" }, meaning: { en: "Hatched fill. Comes from Appointments — change it there.", vi: "Nền gạch chéo. Đến từ trang Lịch hẹn — sửa ở đó." }, tone: "progress" },
      { label: { en: "Walk-in", vi: "Khách vãng lai" }, meaning: { en: "Hatched fill. A client checked in at the desk.", vi: "Nền gạch chéo. Khách được nhận tại quầy." }, tone: "completed" },
    ],
    gotchas: [
      {
        en: "Hatched blocks are read-only on purpose. Tapping one shows the details but sends you to the right screen to change it.",
        vi: "Khối gạch chéo cố ý chỉ để xem. Chạm vào sẽ hiện chi tiết và chỉ bạn tới đúng trang để sửa.",
      },
      {
        en: "A tech can't have two overlapping shifts. If the app refuses, edit the existing shift instead of adding a second one.",
        vi: "Một thợ không thể có hai ca chồng nhau. Nếu bị từ chối, hãy sửa ca đã có thay vì thêm ca mới.",
      },
    ],
  },
  {
    id: "jobs",
    href: "/jobs",
    title: { en: "Check in a client", vi: "Nhận khách" },
    purpose: {
      en: "Where a walk-in client is entered. It creates the client record if they're new and puts them into the rotation.",
      vi: "Nơi nhập khách vãng lai. Tự tạo hồ sơ khách nếu là khách mới và đưa họ vào hàng chờ.",
    },
    add: {
      intro: { en: "This is the busiest form in the app.", vi: "Đây là biểu mẫu dùng nhiều nhất." },
      steps: [
        { action: { en: "Pick an existing client, or tap New client and type their name and phone.", vi: "Chọn khách có sẵn, hoặc bấm Khách mới rồi nhập tên và số điện thoại." } },
        { action: { en: "Choose the service from the menu — the price comes with it.", vi: "Chọn dịch vụ trong thực đơn — giá sẽ tự đi kèm." } },
        { action: { en: "Leave the tech on Next in rotation unless the client asked for someone.", vi: "Để mục thợ ở Thợ tới lượt trừ khi khách yêu cầu người cụ thể." } },
        { action: { en: "Tap Check in walk-in.", vi: "Bấm Nhận khách vãng lai." } },
      ],
    },
    edit: {
      en: "Once checked in, manage the client from Walk-ins — Start, Finish or reassign there.",
      vi: "Sau khi nhận, quản lý khách ở trang Lượt & Hàng chờ — Bắt đầu, Hoàn tất hoặc đổi thợ ở đó.",
    },
    remove: {
      en: "Tap Cancel on the client's card. Cancelled clients stay in the record but leave the floor.",
      vi: "Bấm Hủy trên thẻ khách. Khách đã hủy vẫn lưu trong hồ sơ nhưng không còn trên sàn.",
    },
    badges: [
      { label: { en: "Waiting", vi: "Đang chờ" }, meaning: { en: "Checked in, not started.", vi: "Đã nhận, chưa bắt đầu." }, tone: "waiting" },
      { label: { en: "In progress", vi: "Đang làm" }, meaning: { en: "A tech has started the service.", vi: "Thợ đã bắt đầu làm." }, tone: "progress" },
      { label: { en: "Completed", vi: "Hoàn tất" }, meaning: { en: "Finished. Payment may still be owed.", vi: "Đã xong. Có thể vẫn chưa thanh toán." }, tone: "completed" },
    ],
    gotchas: [
      {
        en: "If a client booked ahead, check them in from Appointments instead — that keeps the booking linked.",
        vi: "Nếu khách đã đặt trước, hãy nhận khách ở trang Lịch hẹn — để giữ liên kết với lịch đã đặt.",
      },
      {
        en: "Picking the service from the menu matters: typing a name by hand means no price at checkout.",
        vi: "Nên chọn dịch vụ từ thực đơn: gõ tay sẽ không có giá khi thanh toán.",
      },
    ],
  },
  {
    id: "appointments",
    href: "/appointments",
    title: { en: "Bookings", vi: "Lịch hẹn" },
    purpose: {
      en: "Bookings made in advance. Checking one in turns it into a job on the floor and blocks that time on the schedule.",
      vi: "Lịch đặt trước. Khi nhận khách, lịch hẹn thành công việc trên sàn và giữ chỗ trên lịch làm việc.",
    },
    add: {
      intro: { en: "Book from the form on the right of the screen.", vi: "Đặt lịch bằng biểu mẫu bên phải màn hình." },
      steps: [
        { action: { en: "Choose the client, or add a new one.", vi: "Chọn khách, hoặc thêm khách mới." } },
        { action: { en: "Pick the date and time.", vi: "Chọn ngày và giờ." } },
        { action: { en: "Choose the service, and a tech if the client asked for one.", vi: "Chọn dịch vụ, và chọn thợ nếu khách yêu cầu." } },
        { action: { en: "Tap Book appointment.", vi: "Bấm Đặt lịch hẹn." } },
      ],
    },
    edit: {
      en: "Change the date, time or tech by cancelling and rebooking — the schedule updates itself either way.",
      vi: "Đổi ngày, giờ hoặc thợ bằng cách hủy rồi đặt lại — lịch làm việc sẽ tự cập nhật.",
    },
    remove: { en: "Tap Cancel on the booking row.", vi: "Bấm Hủy trên dòng lịch hẹn." },
    badges: [
      { label: { en: "Pending", vi: "Chờ đến" }, meaning: { en: "Booked, client hasn't arrived.", vi: "Đã đặt, khách chưa tới." }, tone: "waiting" },
      { label: { en: "Checked in", vi: "Đã nhận" }, meaning: { en: "Client arrived and is on the floor.", vi: "Khách đã tới và đang trên sàn." }, tone: "progress" },
      { label: { en: "Completed", vi: "Hoàn tất" }, meaning: { en: "Service finished.", vi: "Đã làm xong." }, tone: "completed" },
    ],
    gotchas: [
      {
        en: "Assigning a tech to a booking takes them out of the walk-in rotation for that time, plus five minutes either side. That is intended.",
        vi: "Gán thợ cho lịch hẹn sẽ đưa họ ra khỏi lượt khách vãng lai trong khoảng đó, cộng 5 phút mỗi bên. Đây là cố ý.",
      },
      {
        en: "Leave the tech blank if the client has no preference — the rotation picks fairly at check-in.",
        vi: "Để trống ô thợ nếu khách không yêu cầu — hệ thống sẽ chia công bằng khi nhận khách.",
      },
    ],
  },
  {
    id: "services",
    href: "/services",
    title: { en: "Services & prices", vi: "Dịch vụ & Bảng giá" },
    purpose: {
      en: "Your price list, and the commission split. Prices set here appear at check-in, on bookings and at checkout.",
      vi: "Bảng giá của tiệm và tỉ lệ chia hoa hồng. Giá đặt ở đây sẽ hiện khi nhận khách, khi đặt lịch và khi thanh toán.",
    },
    add: {
      intro: { en: "Manager only.", vi: "Chỉ quản lý mới sửa được." },
      steps: [
        { action: { en: "Tap Add service.", vi: "Bấm Thêm dịch vụ." } },
        { action: { en: "Enter the name, price and how many minutes it takes.", vi: "Nhập tên, giá và số phút thực hiện." } },
        { action: { en: "Tap the skills it needs — leave empty if any tech can do it.", vi: "Chọn kỹ năng cần có — để trống nếu thợ nào cũng làm được." } },
        { action: { en: "Tap Add to menu.", vi: "Bấm Thêm vào thực đơn." } },
      ],
    },
    edit: { en: "Tap the pencil on the service row.", vi: "Bấm biểu tượng bút chì trên dòng dịch vụ." },
    remove: {
      en: "Tap × on the row. Past jobs keep the price they were charged.",
      vi: "Bấm × trên dòng đó. Các hóa đơn cũ vẫn giữ nguyên giá đã tính.",
    },
    gotchas: [
      {
        en: "The skills you tick control who the rotation can give the work to. Tick too many and nobody qualifies.",
        vi: "Kỹ năng bạn chọn quyết định ai được giao việc. Chọn quá nhiều thì không thợ nào đủ điều kiện.",
      },
      {
        en: "Duration drives how much space a booking takes on the schedule — a wrong number makes the day look wrong.",
        vi: "Thời lượng quyết định độ dài khối trên lịch — nhập sai sẽ làm lịch trong ngày sai theo.",
      },
    ],
  },
  {
    id: "staff",
    href: "/staff",
    title: { en: "Team", vi: "Nhân viên & Thợ" },
    purpose: {
      en: "Everyone who can sign in, what they can do, what they earn, and which services they offer.",
      vi: "Danh sách người đăng nhập được, quyền của họ, mức hoa hồng, và dịch vụ họ làm được.",
    },
    add: {
      intro: { en: "Manager only.", vi: "Chỉ quản lý mới thêm được." },
      steps: [
        { action: { en: "Fill in Full name, Email and a Temporary password in Add someone.", vi: "Điền Họ tên, Email và Mật khẩu tạm ở mục Thêm người." } },
        { action: { en: "Choose the role: Tech, Admin or Manager.", vi: "Chọn vai trò: Thợ, Quản trị hoặc Quản lý." } },
        { action: { en: "Tap Add to salon, then give them the password.", vi: "Bấm Thêm vào tiệm, rồi đưa mật khẩu cho họ." } },
      ],
    },
    edit: {
      en: "Change the commission in the box on their row and tap Save. Change the role with the dropdown. Tick their services in the panel below the list.",
      vi: "Sửa hoa hồng trong ô trên dòng của họ rồi bấm Lưu. Đổi vai trò bằng ô chọn. Chọn dịch vụ của họ ở bảng bên dưới danh sách.",
    },
    remove: {
      en: "Tap Deactivate. This takes them off the rotation but keeps their history and pay records.",
      vi: "Bấm Ngưng hoạt động. Họ sẽ ra khỏi lượt nhưng vẫn giữ lịch sử và dữ liệu lương.",
    },
    badges: [
      { label: { en: "On rotation", vi: "Trong lượt" }, meaning: { en: "Checked in for today.", vi: "Đã điểm danh hôm nay." }, tone: "completed" },
      { label: { en: "Not checked in", vi: "Chưa điểm danh" }, meaning: { en: "Won't receive walk-ins yet.", vi: "Chưa nhận được khách vãng lai." }, tone: "muted" },
      { label: { en: "Inactive", vi: "Ngưng hoạt động" }, meaning: { en: "Can't be scheduled or assigned.", vi: "Không xếp lịch hay giao việc được." }, tone: "muted" },
    ],
    gotchas: [
      {
        en: "A blank commission box means the salon default, not zero. The placeholder shows the default.",
        vi: "Ô hoa hồng để trống nghĩa là dùng mức mặc định của tiệm, không phải 0. Chữ mờ trong ô là mức mặc định.",
      },
      {
        en: "Changing a rate does not change money already recorded. Past payments keep the rate they were paid at.",
        vi: "Đổi mức hoa hồng không làm thay đổi tiền đã ghi nhận. Hóa đơn cũ giữ nguyên mức lúc thanh toán.",
      },
    ],
  },
  {
    id: "payments",
    href: "/payments",
    title: { en: "Payments", vi: "Thanh toán" },
    purpose: {
      en: "Taking money at the counter. Recording a payment also finishes the client's job.",
      vi: "Thu tiền tại quầy. Ghi nhận thanh toán cũng đồng thời hoàn tất công việc của khách.",
    },
    add: {
      intro: { en: "Anything unpaid sits at the top of the screen.", vi: "Mục chưa thanh toán nằm ở đầu màn hình." },
      steps: [
        { action: { en: "Tap Take payment on the client's row.", vi: "Bấm Thu tiền trên dòng của khách." } },
        { action: { en: "Add each service from the dropdown — adjust quantity with + and −.", vi: "Thêm từng dịch vụ trong danh sách — chỉnh số lượng bằng + và −." } },
        { action: { en: "Enter the tip, or tap a percentage button.", vi: "Nhập tiền tip, hoặc bấm nút phần trăm." } },
        { action: { en: "Choose Cash, Card or Other, then tap Record payment & finish.", vi: "Chọn Tiền mặt, Thẻ hoặc Khác, rồi bấm Ghi nhận & hoàn tất." } },
      ],
    },
    edit: {
      en: "Tap Edit payment on a paid row to correct it. There is only ever one payment per client visit.",
      vi: "Bấm Sửa thanh toán trên dòng đã trả để chỉnh lại. Mỗi lượt khách chỉ có một khoản thanh toán.",
    },
    remove: {
      en: "Payments are corrected, not deleted. Edit the amounts to zero if it was recorded in error.",
      vi: "Thanh toán được sửa chứ không xóa. Nếu ghi nhầm, hãy sửa số tiền về 0.",
    },
    gotchas: [
      {
        en: "Tips are never split — the tech keeps the whole tip. The commission applies to the service amount only.",
        vi: "Tiền tip không bị chia — thợ giữ trọn tiền tip. Hoa hồng chỉ áp dụng cho tiền dịch vụ.",
      },
      {
        en: "The Goes to dropdown decides whose tip it is. Change it when someone else did the work.",
        vi: "Ô Trả cho quyết định tip thuộc về ai. Hãy đổi nếu người khác làm khách đó.",
      },
    ],
  },
  {
    id: "earnings",
    href: "/earnings",
    title: { en: "Reports", vi: "Thu nhập & Báo cáo" },
    purpose: {
      en: "What each tech earned and what the salon kept, over today, this week, or the pay period. Techs see only their own numbers.",
      vi: "Mỗi thợ kiếm được bao nhiêu và tiệm giữ lại bao nhiêu, theo hôm nay, tuần này hoặc kỳ lương. Thợ chỉ xem được số của mình.",
    },
    edit: {
      en: "Nothing is edited here. Fix a number by correcting the payment on the Payments screen.",
      vi: "Không sửa gì ở đây. Muốn sửa số liệu, hãy chỉnh lại hóa đơn ở trang Thanh toán.",
    },
    gotchas: [
      {
        en: "The percentage next to a tech's name is their own rate, not the salon default.",
        vi: "Phần trăm cạnh tên thợ là mức riêng của họ, không phải mức mặc định của tiệm.",
      },
      {
        en: "The pay period start comes from Services & Pricing. Set it once and it rolls forward on its own.",
        vi: "Ngày bắt đầu kỳ lương lấy từ trang Dịch vụ & Bảng giá. Cài một lần rồi hệ thống tự cuốn chiếu.",
      },
    ],
  },
  {
    id: "clients",
    href: "/customers",
    title: { en: "Clients", vi: "Khách hàng" },
    purpose: {
      en: "Names, phone numbers and notes. Notes travel with the client so any tech can pick up where the last one left off.",
      vi: "Tên, số điện thoại và ghi chú. Ghi chú đi theo khách để thợ nào cũng nắm được lần trước làm gì.",
    },
    add: {
      intro: { en: "Most clients are created automatically at check-in.", vi: "Phần lớn khách được tạo tự động khi nhận khách." },
      steps: [
        { action: { en: "Tap New client.", vi: "Bấm Khách mới." } },
        { action: { en: "Enter the name, phone and any notes.", vi: "Nhập tên, số điện thoại và ghi chú." } },
        { action: { en: "Tap Add client.", vi: "Bấm Thêm khách." } },
      ],
    },
    edit: { en: "Tap the pencil on the client's card.", vi: "Bấm biểu tượng bút chì trên thẻ khách." },
    remove: {
      en: "Tap × on the card. This removes their visit history too — deactivating is usually not what you want here.",
      vi: "Bấm × trên thẻ. Thao tác này xóa cả lịch sử lượt khách — hãy cân nhắc kỹ.",
    },
    gotchas: [
      {
        en: "Search matches name or phone. Type the last four digits if the name was spelled differently.",
        vi: "Tìm kiếm theo tên hoặc số điện thoại. Gõ 4 số cuối nếu tên bị viết khác.",
      },
      {
        en: "Allergies belong in Notes — that is the field techs actually see on the job card.",
        vi: "Dị ứng nên ghi vào Ghi chú — đó là ô thợ nhìn thấy trên thẻ công việc.",
      },
    ],
  },
  {
    id: "tech-view",
    href: "/tech",
    title: { en: "My turn (tech view)", vi: "Lượt của tôi (màn hình thợ)" },
    purpose: {
      en: "What a technician sees when they sign in: whether they're on the rotation, their place in it, the client offered to them, and what they've earned.",
      vi: "Màn hình thợ khi đăng nhập: đã vào lượt chưa, đứng thứ mấy, khách đang được giao, và thu nhập của mình.",
    },
    add: {
      intro: { en: "The first thing a tech does each day.", vi: "Việc đầu tiên thợ làm mỗi ngày." },
      steps: [
        { action: { en: "Tap Check in for turns today.", vi: "Bấm Điểm danh nhận lượt hôm nay." } },
        { action: { en: "When a client is offered, tap Accept to start, or Pass to decline.", vi: "Khi được giao khách, bấm Nhận để bắt đầu, hoặc Bỏ lượt để từ chối." } },
      ],
    },
    gotchas: [
      {
        en: "Until a tech checks in, they are invisible to the rotation no matter what their shift says.",
        vi: "Chưa điểm danh thì thợ không xuất hiện trong lượt, dù ca làm đã có trên lịch.",
      },
      {
        en: "Pass moves them to the back of the queue. It is not a way to wait for a better client.",
        vi: "Bỏ lượt sẽ đẩy thợ xuống cuối hàng. Đây không phải cách để chờ khách tốt hơn.",
      },
    ],
  },
  {
    id: "settings",
    href: "/settings",
    title: { en: "Settings", vi: "Cài đặt" },
    purpose: {
      en: "The salon's name and your own account details. Short by design — services, staff and pay each have their own screen.",
      vi: "Tên tiệm và thông tin tài khoản của bạn. Cố ý ngắn gọn — dịch vụ, nhân viên và lương đều có trang riêng.",
    },
    edit: {
      en: "Change a field and tap Save.",
      vi: "Sửa nội dung rồi bấm Lưu.",
    },
    gotchas: [
      {
        en: "The salon name shows on every device in the shop, so keep it short enough to read in the header.",
        vi: "Tên tiệm hiện trên mọi thiết bị, nên đặt đủ ngắn để đọc được trên thanh tiêu đề.",
      },
    ],
  },
];
