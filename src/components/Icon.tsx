import { icon } from "@/lib/art";

// Painted system icon (public/art/icons/icon_<name>.webp), sized by className.
export function Icon({
  name,
  className = "h-4",
}: {
  name: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={icon(name)}
      alt=""
      draggable={false}
      className={`inline-block aspect-square align-middle ${className}`}
    />
  );
}
