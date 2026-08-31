import { Text, TextProps, TextStyle, Platform } from "react-native";
import { cn } from "@/lib/utils";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";

type TextVariant = "body" | "bodySmall" | "caption" | "headline" | "title" | "titleLarge" | "display" | "numeric" | "button" | "label";

const variantStyles: Record<TextVariant, { fontSize: number; fontWeight: TextStyle["fontWeight"]; lineHeight?: number; letterSpacing?: number }> = {
  display: { fontSize: 32, fontWeight: "800", lineHeight: 40, letterSpacing: -0.5 },
  titleLarge: { fontSize: 22, fontWeight: "800", lineHeight: 28 },
  title: { fontSize: 18, fontWeight: "800", lineHeight: 24 },
  headline: { fontSize: 16, fontWeight: "700", lineHeight: 22 },
  body: { fontSize: 15, fontWeight: "500", lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: "500", lineHeight: 19 },
  caption: { fontSize: 11, fontWeight: "500", lineHeight: 16 },
  button: { fontSize: 15, fontWeight: "900", lineHeight: 22, letterSpacing: 0.2 },
  label: { fontSize: 11, fontWeight: "800", lineHeight: 16, letterSpacing: 0.3 },
  numeric: { fontSize: 15, fontWeight: "700", lineHeight: 22 },
};

export interface ThemedTextProps extends Omit<TextProps, "style" | "children"> {
  variant?: TextVariant;
  color?: string;
  weight?: TextStyle["fontWeight"];
  className?: string;
  children: React.ReactNode;
  numberText?: boolean;
  style?: TextStyle | TextStyle[];
  textAlign?: TextStyle["textAlign"];
}

export function ThemedText({
  variant = "body",
  color,
  weight,
  className,
  children,
  numberText = false,
  style,
  textAlign,
  ...props
}: ThemedTextProps) {
  const { isRTL, language } = useAppPreferences();
  const colors = useColors();
  const fonts = colors.font;

  const isArabic = language === "ar" || isRTL;
  const fontFamily = numberText
    ? fonts.numbers
    : isArabic
    ? weight === "bold" || weight === "800" || weight === "900"
      ? fonts.arabicBold
      : weight === "700"
      ? fonts.arabicMedium
      : fonts.arabic
    : fonts.latin;

  const variantStyle = variantStyles[variant];
  const resolvedTextAlign = textAlign ?? (isRTL ? "right" : "left");

  return (
    <Text
      {...props}
      style={[
        {
          fontSize: variantStyle.fontSize,
          fontWeight: weight ?? variantStyle.fontWeight,
          lineHeight: variantStyle.lineHeight,
          letterSpacing: variantStyle.letterSpacing,
          fontFamily,
          color: color ?? colors.foreground,
          textAlign: resolvedTextAlign,
          writingDirection: numberText ? "ltr" : isRTL ? "rtl" : "ltr",
          includeFontPadding: false,
          textAlignVertical: "center",
        },
        style,
      ]}
      className={cn(className)}
    >
      {children}
    </Text>
  );
}

export function ThemedNumber({ variant = "numeric", color, weight, className, children, style, ...props }: Omit<ThemedTextProps, "numberText">) {
  return <ThemedText variant={variant} color={color} weight={weight} className={className} numberText={true} style={style} {...props}>{children}</ThemedText>;
}