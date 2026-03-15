"use client"

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  type PieLabelRenderProps,
} from "recharts"

const COLORS = [
  "#4f7942",
  "#6b8e5a",
  "#8fbc8f",
  "#b8d4a3",
  "#dcedc8",
  "#a8c896",
]

interface AllocationData {
  name: string
  value: number
  percentage: number
}

interface AllocationChartProps {
  data: AllocationData[]
  title?: string
}

function renderLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percentage,
}: {
  cx: number
  cy: number
  midAngle: number
  innerRadius: number
  outerRadius: number
  percentage: number
}) {
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  if (percentage < 5) return null

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-xs font-medium"
    >
      {percentage.toFixed(0)}%
    </text>
  )
}

export function AllocationChart({ data, title }: AllocationChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="flex flex-col items-center">
      {title && (
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          {title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            label={(props: PieLabelRenderProps) =>
              renderLabel({
                cx: Number(props.cx ?? 0),
                cy: Number(props.cy ?? 0),
                midAngle: Number(props.midAngle ?? 0),
                innerRadius: Number(props.innerRadius ?? 0),
                outerRadius: Number(props.outerRadius ?? 0),
                percentage:
                  data[props.index as number]?.percentage ?? 0,
              })
            }
            labelLine={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-foreground text-sm font-semibold"
          >
            ${total.toLocaleString()}
          </text>
          <Tooltip
            formatter={(value, name) => [
              `$${Number(value).toLocaleString()}`,
              String(name),
            ]}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid rgb(38 38 38)",
              background: "#0a0a0a",
              color: "#fafafa",
            }}
          />
          <Legend
            verticalAlign="bottom"
            formatter={(value: string, entry) => {
              const item = data.find((d) => d.name === value)
              return (
                <span style={{ color: entry.color }}>
                  {value} ({item?.percentage ?? 0}%)
                </span>
              )
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
