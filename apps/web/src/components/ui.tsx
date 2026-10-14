import { useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { motion as m, type HTMLMotionProps } from "motion/react";
import { ChevronDown } from "lucide-react";
import { motion } from "@stride/ui-tokens";
import { cn } from "@/lib/utils";

export const pressSpring = { type: "spring", ...motion.spring.bouncy } as const;
export const smoothSpring = { type: "spring", ...motion.spring.smooth } as const;

const BUTTON_VARIANTS = {
  primary: "bg-polo text-on-polo hover:brightness-105",
  ink: "bg-ink text-bg hover:opacity-90",
  ghost: "bg-card2 text-ink hover:bg-line2",
  quiet: "text-ink2 hover:bg-card2 hover:text-ink",
  danger: "text-polo-ink hover:bg-polo-soft",
} as const;

const BUTTON_SIZES = {
  md: "h-11 px-[18px] type-button",
  sm: "h-[34px] px-[13px] type-button-small",
} as const;

type ButtonProps = HTMLMotionProps<"button"> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
};

// The one button: pill shaped, springs down a little when pressed.
export function Button({ variant = "primary", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return (
    <m.button
      type={type}
      whileTap={rest.disabled ? undefined : { scale: motion.press.scale }}
      transition={pressSpring}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-pill whitespace-nowrap transition-[background-color,color,opacity,filter] disabled:pointer-events-none disabled:opacity-40",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}

// Shared look for text inputs, number inputs and textareas.
export const fieldClass =
  "rounded-sm border border-line2 bg-card px-3.5 py-2.5 type-input text-ink placeholder:text-ink3 transition-colors hover:border-ink3 focus:border-polo focus:outline-none focus-visible:outline-none";

// A native select dressed like the other fields, with a chevron.
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <select {...rest} className={cn(fieldClass, "w-full appearance-none pr-9")}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink3" />
    </span>
  );
}

// Small caps label above a value or a group.
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("type-eyebrow text-ink3", className)}>{children}</p>;
}

// Tiny uppercase tag, e.g. "est." on estimated food.
export function Tag({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "est" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-tag px-[7px] py-[3px] type-tag",
        tone === "est" ? "bg-polo-soft text-polo-ink" : "bg-card2 text-ink2",
      )}
    >
      {children}
    </span>
  );
}

// A panel on the warm background. The title is an eyebrow; action sits on its right.
export function Card({
  title,
  action,
  className,
  children,
}: {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-5 rounded-card bg-card p-6 shadow-card", className)}>
      {title || action ? (
        <div className="flex min-h-[34px] items-center justify-between gap-4">
          {title ? <Eyebrow>{title}</Eyebrow> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

// A pulsing grey block shown while data loads.
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-sm bg-card2 motion-safe:animate-pulse", className)} />;
}

// A card-shaped placeholder: eyebrow, a big number and a few lines.
export function CardSkeleton({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className={cn("flex flex-col gap-4 rounded-card bg-card p-6 shadow-card", className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-10 w-40" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3", i % 2 === 0 ? "w-full" : "w-2/3")} />
      ))}
    </div>
  );
}

// Three bouncing dots and a line, for work the server is doing.
export function Thinking({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2.5 type-secondary text-ink2" role="status">
      <span aria-hidden className="inline-flex gap-[3px]">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 rounded-pill bg-ink3 motion-safe:animate-[dot_1s_infinite]"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

// Empty state: Polo, a short title, one plain line, and an optional action.
export function Empty({ title, body, mood = "idle", children }: { title: string; body: string; mood?: PoloMood; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <Polo size={56} mood={mood} />
      <p className="mt-2 type-empty-title text-ink">{title}</p>
      <p className="max-w-xs type-secondary text-ink2">{body}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

// Full-height centered block for app-level loading and blocking states.
export function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-center text-ink2">{children}</div>;
}

const POLO_BODY =
  "M32 8.5c3.2 0 5.4-2.6 8.2-2.2 2.6.4 3 3.4 1.3 5.2 9.6 3.4 16 12.4 16 23.2 0 14-11 24.3-25.5 24.3S6.5 48.7 6.5 34.7C6.5 20.3 17.6 8.5 32 8.5z";

export type PoloMood = "idle" | "happy" | "sleep";

// Eye cut-outs for a mood, drawn in the mask.
function PoloEyes({ mood }: { mood: PoloMood }) {
  if (mood === "idle")
    return (
      <g fill="#000">
        <ellipse cx={24.5} cy={33} rx={3.6} ry={5} />
        <ellipse cx={39.5} cy={33} rx={3.6} ry={5} />
      </g>
    );
  const d = mood === "happy" ? ["M20.5 34.5q4-5.5 8 0", "M35.5 34.5q4-5.5 8 0"] : ["M21 34q3.5 2.6 7 0", "M36 34q3.5 2.6 7 0"];
  return (
    <g fill="none" stroke="#000" strokeWidth={3.2} strokeLinecap="round">
      {d.map((path) => (
        <path key={path} d={path} />
      ))}
    </g>
  );
}

// Polo, the flat coral mascot. Breathes slowly unless the user asked for less motion.
export function Polo({ size, mood = "idle" }: { size: number; mood?: PoloMood }) {
  const maskId = `polo${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className="shrink-0 origin-[50%_92%] motion-safe:animate-[breathe_3.6s_ease-in-out_infinite]"
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-10} y={-10} width={84} height={84}>
          <rect x={-10} y={-10} width={84} height={84} fill="#fff" />
          <PoloEyes mood={mood} />
        </mask>
      </defs>
      <path d={POLO_BODY} mask={`url(#${maskId})`} className="fill-polo" />
    </svg>
  );
}

// The Stride S mark. Its colour follows the text colour.
export function StrideMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1254 1254" fill="currentColor" aria-hidden className={className}>
      <path d={STRIDE_PATH} />
    </svg>
  );
}

const STRIDE_PATH =
  "M791.863 218.875C796.785 221.146 800.167 223.783 803.423 228.093C805.045 230.055 806.744 231.603 808.689 233.242C812.935 236.9 816.903 240.775 820.85 244.752C821.589 245.493 822.328 246.234 823.09 246.997C824.682 248.592 826.272 250.189 827.861 251.786C830.382 254.32 832.906 256.85 835.431 259.38C841.699 265.661 847.961 271.947 854.223 278.233C859.524 283.554 864.828 288.874 870.135 294.19C872.611 296.674 875.085 299.16 877.559 301.647C879.089 303.181 880.62 304.714 882.15 306.248C882.829 306.932 883.508 307.616 884.207 308.32C888.079 312.193 892.057 315.88 896.211 319.449C913.703 334.609 913.703 334.609 915.426 344.426C915.856 352.321 913.187 359.927 907.909 365.82C906.698 367.05 905.471 368.265 904.231 369.466C903.559 370.14 902.887 370.815 902.195 371.51C899.991 373.714 897.768 375.896 895.543 378.078C893.995 379.618 892.448 381.158 890.902 382.7C886.843 386.743 882.765 390.766 878.684 394.786C875.363 398.063 872.055 401.354 868.748 404.645C864.788 408.585 860.823 412.52 856.855 416.453C856.105 417.197 855.355 417.941 854.582 418.708C852.443 420.825 850.301 422.939 848.157 425.052C847.534 425.669 846.911 426.286 846.269 426.922C842.802 430.331 839.248 433.574 835.521 436.697C833.214 438.673 831.116 440.823 829 443C827.844 444.183 826.687 445.366 825.53 446.549C824.896 447.2 824.261 447.851 823.607 448.521C820.735 451.46 817.85 454.386 814.963 457.312C813.447 458.853 811.935 460.399 810.428 461.949C808.239 464.199 806.033 466.433 803.824 468.664C802.827 469.7 802.827 469.7 801.81 470.757C796.229 476.341 790.637 479.425 782.5 479.437C775.522 479.215 771.14 477.092 766.188 472.25C760.725 464.135 760.587 457.074 760.707 447.531C760.711 446.255 760.716 444.979 760.72 443.664C760.734 440.297 760.761 436.931 760.794 433.564C760.825 430.118 760.838 426.672 760.854 423.227C760.887 416.484 760.937 409.742 761 403C735.399 403.037 709.798 403.097 684.197 403.184C672.308 403.224 660.42 403.256 648.531 403.271C638.16 403.284 627.79 403.311 617.419 403.355C611.936 403.377 606.452 403.393 600.969 403.392C595.791 403.391 590.614 403.409 585.436 403.441C583.551 403.45 581.667 403.451 579.782 403.446C543.731 403.352 508.842 415.894 482.797 441.199C469.087 454.928 458.662 471.361 453 490C452.701 490.927 452.402 491.854 452.094 492.809C447.292 510.616 447.674 531.981 455 549C455.284 549.674 455.568 550.348 455.861 551.043C467.616 578.21 489.012 594.891 515.921 605.777C526.02 609.709 536.305 611.574 547 613C548.215 613.169 549.43 613.337 550.682 613.511C554.605 613.998 558.457 614.13 562.413 614.138C563.114 614.141 563.815 614.144 564.538 614.147C566.864 614.155 569.19 614.156 571.516 614.158C573.194 614.162 574.872 614.167 576.55 614.173C580.156 614.184 583.761 614.193 587.367 614.199C593.091 614.21 598.815 614.23 604.539 614.252C620.814 614.314 637.089 614.368 653.364 614.401C662.359 614.42 671.354 614.449 680.35 614.489C685.096 614.51 689.842 614.526 694.589 614.528C713.935 614.54 732.88 614.651 752 618C753.525 618.247 755.05 618.493 756.576 618.737C778.12 622.294 798.832 630.722 818 641C818.619 641.331 819.238 641.663 819.876 642.004C828.033 646.419 835.655 651.33 843 657C844.21 657.92 844.21 657.92 845.445 658.859C868.689 676.946 886.526 698.859 900 725C900.322 725.603 900.643 726.206 900.975 726.827C916.434 755.925 920.215 788.575 919 821C918.972 821.888 918.944 822.777 918.915 823.692C917.513 858.897 901.573 895.572 880 923C879.41 923.793 878.819 924.586 878.211 925.402C866.949 939.962 853.149 953.532 838 964C836.894 964.797 835.789 965.593 834.684 966.391C810.545 983.459 782.58 994.893 753.613 1000.47C752.098 1000.78 750.585 1001.1 749.081 1001.45C733.106 1005.17 716.879 1005.29 700.556 1005.23C698.376 1005.23 696.196 1005.23 694.016 1005.23C688.159 1005.23 682.303 1005.22 676.447 1005.2C670.304 1005.19 664.161 1005.19 658.018 1005.19C646.412 1005.18 634.807 1005.16 623.202 1005.14C609.978 1005.12 596.754 1005.11 583.53 1005.1C556.354 1005.08 529.177 1005.04 502 1005C502.01 1005.97 502.01 1005.97 502.02 1006.96C502.087 1013.73 502.132 1020.49 502.165 1027.26C502.18 1029.78 502.2 1032.31 502.226 1034.83C502.263 1038.46 502.28 1042.09 502.293 1045.72C502.308 1046.85 502.324 1047.97 502.34 1049.13C502.342 1056.67 501.72 1061.75 496.75 1067.69C490.446 1072.99 485.265 1075.23 477 1075C467.538 1074.14 460.634 1066.1 454 1060C453.015 1059.1 452.029 1058.2 451.043 1057.3C449.237 1055.66 447.434 1054.01 445.633 1052.35C443.046 1050.04 440.393 1047.86 437.688 1045.69C432.632 1041.61 427.918 1037.25 423.194 1032.8C418.878 1028.76 414.395 1025 409.777 1021.31C406.576 1018.65 403.538 1015.85 400.5 1013C395.743 1008.54 390.842 1004.37 385.758 1000.29C381.62 996.857 377.703 993.201 373.762 989.551C366.839 983.157 359.624 977.091 352.465 970.965C351.617 970.237 351.617 970.237 350.752 969.495C349.537 968.458 348.317 967.428 347.092 966.403C346.472 965.882 345.853 965.361 345.215 964.824C344.655 964.357 344.096 963.89 343.519 963.409C339.31 959.506 337.35 955.319 336.762 949.738C336.566 943.335 337.274 938.319 341 933C347.177 926.482 354.233 920.933 361.219 915.312C364.24 912.8 367.124 910.176 370 907.5C374.588 903.231 379.334 899.242 384.219 895.312C387.24 892.8 390.124 890.176 393 887.5C397.588 883.231 402.334 879.242 407.219 875.312C410.24 872.8 413.124 870.176 416 867.5C420.61 863.21 425.378 859.196 430.285 855.246C433.107 852.912 435.806 850.48 438.5 848C442.939 843.914 447.528 840.088 452.227 836.305C456.119 833.07 459.806 829.63 463.492 826.164C469.803 820.718 475.027 819.618 483.184 819.727C489.295 820.32 493.343 822.982 497.375 827.5C501.068 832.039 502.251 835.326 502.227 841.237C502.227 843.129 502.227 843.129 502.227 845.059C502.216 846.43 502.206 847.801 502.195 849.172C502.192 850.579 502.189 851.985 502.187 853.392C502.179 857.088 502.16 860.783 502.137 864.479C502.117 868.253 502.108 872.027 502.098 875.801C502.076 883.201 502.042 890.6 502 898C530.061 897.963 558.122 897.903 586.183 897.816C599.214 897.776 612.245 897.744 625.276 897.729C636.642 897.716 648.009 897.689 659.375 897.645C665.386 897.623 671.396 897.607 677.407 897.608C683.081 897.609 688.755 897.591 694.429 897.559C696.496 897.55 698.562 897.549 700.629 897.554C729.731 897.623 758.885 891.095 781 871C781.904 870.189 782.807 869.378 783.738 868.543C800.665 852.552 809.67 831.904 810.33 808.727C810.628 788.575 805.249 771.462 792 756C791.566 755.423 791.131 754.845 790.684 754.25C777.938 737.814 754.614 727.667 734.623 724.427C727.576 723.597 720.504 723.726 713.419 723.745C711.675 723.742 709.93 723.738 708.186 723.734C704.449 723.726 700.712 723.723 696.975 723.726C691.04 723.728 685.105 723.714 679.17 723.697C662.3 723.65 645.429 723.626 628.558 723.619C619.225 723.615 609.892 723.597 600.559 723.564C595.638 723.547 590.718 723.538 585.797 723.547C565.133 723.582 545.304 723.306 525 719C523.147 718.631 521.295 718.265 519.441 717.901C511.204 716.274 503.045 714.416 495 712C493.747 711.63 492.494 711.26 491.203 710.879C461.241 701.89 433.592 686.491 410 666C409.458 665.532 408.916 665.065 408.357 664.583C389.538 648.225 374.633 629.237 363.116 607.124C362.068 605.129 360.983 603.16 359.887 601.191C349.956 582.946 344.861 562.458 342 542C341.898 541.313 341.797 540.625 341.692 539.917C340.723 532.541 340.757 525.116 340.75 517.687C340.749 516.979 340.748 516.271 340.747 515.541C340.766 495.975 343.582 476.839 350.184 458.348C350.806 456.559 351.371 454.75 351.91 452.934C358.011 433.014 368.052 414.971 380 398C380.512 397.272 381.024 396.543 381.552 395.793C388.369 386.201 395.807 377.435 404 369C404.549 368.425 405.098 367.85 405.664 367.258C413.348 359.223 421.303 351.964 430.225 345.327C432.013 343.99 433.781 342.628 435.547 341.262C448.732 331.18 463.019 323.283 477.938 316.062C478.86 315.614 479.782 315.165 480.732 314.703C486.475 311.986 492.248 309.832 498.298 307.898C501.172 306.988 501.172 306.988 504.52 305.465C509.461 303.385 514.524 301.985 519.688 300.562C520.661 300.276 521.635 299.989 522.639 299.693C549.755 292.229 577.155 292.444 605.023 292.594C610.525 292.62 616.028 292.622 621.53 292.627C631.903 292.639 642.275 292.672 652.648 292.712C664.476 292.757 676.305 292.779 688.134 292.799C712.423 292.84 736.711 292.91 761 293C760.98 291.902 760.98 291.902 760.96 290.783C760.839 283.854 760.748 276.926 760.689 269.997C760.658 266.436 760.616 262.875 760.547 259.314C760.469 255.21 760.441 251.108 760.414 247.004C760.383 245.738 760.352 244.472 760.32 243.168C760.317 235.127 761.549 230.036 767 224C774.189 217.324 782.398 215.982 791.863 218.875Z";
